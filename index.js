const { ipcRenderer } = require('electron');



function saveSshData() {
    const form = document.getElementById('ssh-form');
    const username = form.elements.username.value;
    const sshKeyFilePath = form.elements.keyFile.files[0].path;
    const passphrase = form.elements.passphrase.value;
    ipcRenderer.send('sshData', {username, sshKeyFilePath, passphrase});
};