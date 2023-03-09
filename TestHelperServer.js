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
    var http = require('http');
    const querystring = require('querystring');
    const url = require('url');

    var server = http.createServer(function (request, response) {   //create web server
        let requestBody = '';
        let formData = null;

        request.on('data', (data) => {
            requestBody += data;
        });
        
        request.on('end', () => {
            formData = querystring.parse(requestBody);

            if (request.method === "POST") {
                if (Object.keys(formData).length === 0) {
                    answerWithBadRequest(response, 'The POST request body parameters are empty, request cannot be processed.');
                }
                else {
                    if (request.url == "/sshConnectAndExecute") {
                        const sshConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                        sshConnectAndExecute(sshConfig, formData.command, response);
                    }
                    else if (request.url == "/secureCopyToRemote") {
                        const scpConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                        let sourcePath = `downloads/${formData.filename}`
                        let destinationPath = formData.destinationPath;
        
                        secureUpload(scpConfig, sourcePath, destinationPath, response);
                    }
                    else if (request.url == "/secureCopyFromRemote") {
                        const scpConfig = getSshConfiguration(sshKeyFilePath, passphrase, username, formData.host);
                        
                        let sourcePath = `${formData.sourcePath}/${formData.filename}`;
                        let destinationPath = `downloads/${formData.filename}`
        
                        secureDownload(scpConfig, sourcePath, destinationPath, response);
                    }
                    else if (request.url == "/saveAsFile") {
                        fs.writeFile(`downloads/${formData.filename}`, formData.content, function (err) {
                            if (err) throw err;
                            console.log('File is created successfully.');
                            sendOkResponse(response, `The file '${formData.filename}' was created successfully.`)
                          });
                    }
                    else if (request.url == "/executeCommand") {
                        executeCommand(formData.command, formData.input, response);
                    }
                    else {
                        answerWithBadRequest('Invalid POST request type');
                    }
                }
            }
            else if (request.method === "GET" && request.url == "/username") {
                sendOkResponse(response, username)
            }
            else if (request.method === "GET") {
                const parsedUrl = url.parse(request.url, true);
                const urlPath = parsedUrl.pathname;
                const queryParamters = parsedUrl.query;

                if (Object.keys(queryParamters).length === 0) {
                    answerWithBadRequest(response, 'The GET request query parameters are empty, request cannot be processed.');
                }
                else {
                    if (urlPath == "/fileContent") {
                        let filePath = `downloads/${queryParamters.filename}`;
                        let fileContent = fs.readFileSync(filePath);
                        sendOkResponse(response, fileContent)
                    }
                    else {
                        answerWithBadRequest('Invalid GET request type');
                    }
                }
            }
            else {
                answerWithBadRequest('Invalid request type');
            }
        });  
    });

    server.listen(5000);

    console.log('Node.js web server at port 5000 is running..')
}

function sendOkResponse(response, message) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.write(message);
    response.end();
}

function sendKoResponse(response, message) {
    response.writeHead(500, { 'Content-Type': 'text/html' });
    response.write(message);
    response.end();
}

function answerWithBadRequest(response, message) {
    response.writeHead(400, { 'Content-Type': 'text/plain' });
    response.end(message);
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

        sendKoResponse(response, error.message);
    }

    return executionCode;
}

function getSshConfiguration(sshKeyFilePath, passphrase, username, host) {
    return {
        host: host,
        username: username,
        privateKey: fs.readFileSync(sshKeyFilePath),
        passphrase: passphrase
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

    ssh.on('error', function(error) {
        console.error('SSH connection error:', error);
        sendKoResponse(response, error.message);
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

    scp.upload(sourcePath, destinationPath, function(error) {
        if (error) {
            console.log('Error uploading file:', error);
            sendKoResponse(response, error.message);
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

    scp.download(sourcePath, destinationPath, function(error) {
        if (error) {
            console.log('Error downloading file:', error);
            sendKoResponse(response, error.message);
        } 
        else {
            console.log('File downloaded successfully');
            sendOkResponse(response, `The file '${destinationPath}' was copied securely from the remote host ${scpConfiguration.host} under '${sourcePath}'.`);
        }

        scp.close();
    });
}
