const { app, BrowserWindow, ipcMain  } = require('electron');
const { execSync } = require('child_process');
const sshClient = require('ssh2').Client;
const scpClient = require('scp2').Client;
const fs = require('fs');


function createWindow () {
    const mainWindow = new BrowserWindow({
        width: 600,
        height: 300,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    })

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow()
  })

ipcMain.on('sshData', (event, sshData) => {
    let username = sshData.username;
    let sshKeyFilePath = sshData.sshKeyFilePath;
    let passphrase = sshData.passphrase;

    startServer(username, sshKeyFilePath, passphrase);
  });

function startServer(username, sshKeyFilePath, passphrase) {
    var http = require('http'); // Import Node.js core module
    const querystring = require('querystring');

    var server = http.createServer(function (request, response) {   //create web server
        let requestBody = '';
        let formData = null;

        request.on('data', (data) => {
            requestBody += data;
        });
        
        request.on('end', () => {
            formData = querystring.parse(requestBody);

            if (Object.keys(formData).length === 0) {
                response.writeHead(400, { 'Content-Type': 'text/plain' });
                response.end('The request body parameters are empty, request cannot be processed.');
            }
            else if (request.method === "POST" && request.url == "/sshConnectAndExecute") {
                const sshConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                sshConnectAndExecute(sshConfig, formData.command, response);
      
            }
            else if (request.method === "POST" && request.url == "/secureCopyToRemote") {
                const scpConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                let sourcePath = `downloads/${formData.filename}`
                let destinationPath = `/home/${username}`;

                secureUpload(scpConfig, sourcePath, destinationPath, response);
            }
            else if (request.method === "POST" && request.url == "/secureCopyFromRemote") {
                const scpConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                
                let sourcePath = `/home/${username}/${formData.filename}`;
                let destinationPath = `downloads/${formData.filename}`

                secureDownload(scpConfig, sourcePath, destinationPath, response);
            }
            else if (request.method === "POST" && request.url == "/saveAsFile") {
                fs.writeFile(`downloads/${formData.filename}`, formData.content, function (err) {
                    if (err) throw err;
                    console.log('File is created successfully.');
                    sendOkResponse(response, `The file '${formData.filename}' was created successfully.`)
                  });
            }
            else if (request.method === "POST" && request.url == "/executeCommand") {
                executeCommand(formData.command, formData.input, response);
            }
            else {
                response.writeHead(400, { 'Content-Type': 'text/plain' });
                response.end('Invalid request type');
            }
        });  
    });

    server.listen(5000); //6 - listen for any incoming requests

    console.log('Node.js web server at port 5000 is running..')
}

function sendOkResponse(response, message) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.write(message);
    response.end();
}

function executeCommand(/*String*/ command, /*String*/ input, response) {
    let executionCode = 0;

    try {
        let output = execSync(command, {input: input});

        console.log(`Executed the command : ${command}`);

        let outputMessage = output.toString();
        if(outputMessage) {
            console.log(`Command output : ${outputMessage}`);
        }

        sendOkResponse(response, `The command '${command}' was executed.`)
    } 
    catch (error) {
        executionCode = error.status;
        console.error(`Error executing command: ${error.message}`);
        console.error(`Command error output: ${error.stderr}`);
        console.error(`Command standard output: ${error.stdout}`);
    }

    return executionCode;
}

function getSshConfiguration(sshKeyFilePath, passphrase, username, host) {
    return {
        host: host,
        username: username,
        privateKey: fs.readFileSync(sshKeyFilePath),
        passphrase: passphrase,
    };
}

function sshConnectAndExecute(sshConfiguration, command, response) {
    const ssh = new sshClient();

    ssh.on('ready', function() {
        console.log('SSH connection established');

        ssh.exec(command, function(err, stream) {
            console.log(`Executing the command : ${command} \n`);

            if (err) {
                console.error('Error executing command:', err);
            } 
            
            stream.on('data', (data) => {
                console.log(data.toString());
            }).stderr.on('data', (data) => {
                console.log(`STDERR: ${data}`);
            });

            ssh.end(); // Close the SSH connection
        });
    });

    ssh.on('error', function(err) {
        console.error('SSH connection error:', err);
        ssh.end();
    });

    ssh.on('end', function() {
        console.log('SSH connection closed');
        sendOkResponse(response, `The command '${command}' was executed on the remote host ${sshConfiguration.host}.`)
    });

    ssh.connect(sshConfiguration);
}

function secureUpload(scpConfiguration, sourcePath, destinationPath, response) {
    const scp = new scpClient(scpConfiguration);

    scp.upload(sourcePath, destinationPath, function(err) {
        if (err) {
            console.log('Error uploading file:', err);
        } 
        else {
            console.log('File uploaded successfully');
            sendOkResponse(response, `The file '${sourcePath}' was copied securely to the remote host ${scpConfiguration.host} under '${destinationPath}'.`);
        }

        scp.close();
    });
}

function secureDownload(scpConfiguration, sourcePath, destinationPath, response) {
    const scp = new scpClient(scpConfiguration);

    scp.download(sourcePath, destinationPath, function(err) {
        if (err) {
            console.log('Error downloading file:', err);
        } 
        else {
            console.log('File downloaded successfully');
            sendOkResponse(response, `The file '${destinationPath}' was copied securely from the remote host ${scpConfiguration.host} under '${sourcePath}'.`);
        }

        scp.close();
    });
}
