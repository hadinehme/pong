function buildHashContent(params, secret, prefix = '') {
    return Object.keys(params).sort()
        .filter(paramName => paramName !== 'HASH')
        .map(paramName => {
            let value = params[paramName];
            if (typeof (value) === 'object') {
                return buildHashContent(value, secret, prefix ? (prefix + '[' + paramName + ']') : paramName);
            }
            return (prefix ? prefix + '[' + paramName + ']' : paramName) + "=" + value;
        })
        .join(secret);
}

function computeHashValue(secret) {
    const requestParams = parsePhpRequestParameters();
    if (requestParams.params) {
        const hashContent = secret + buildHashContent(requestParams.params, secret) + secret;
        return CryptoJS.SHA256(hashContent).toString();
    }
}

function parsePhpRequestParameters() {
    if (!pm.request.body.mode || pm.request.body.mode === "raw") {
        return {};
    }
    const parsedParams = {};
    pm.request.body[pm.request.body.mode].each(param => {
        const rawParamName = param.key;
        const paramValue = pm.variables.replaceIn(param.value);
        let currentContainer = parsedParams;

        let paramName = rawParamName;
        let innerParameterStart;
        while ((innerParameterStart = paramName.indexOf('[')) > -1) {
            const path = paramName.substring(0, innerParameterStart);
            paramName = paramName.substring(innerParameterStart + 1).replace(']', '');
            if (!currentContainer[path]) {
                currentContainer[path] = {};
            }
            currentContainer = currentContainer[path];
        }
        currentContainer[paramName] = paramValue
    });

    return parsedParams;
}

//This will lead to a DateHelper Class
function timeConverter(timestamp){
    let a = new Date(timestamp);
    let year = a.getFullYear();
    let month = (a.getMonth()+1).toString().padStart(2, '0');
    let date = a.getDate().toString().padStart(2, '0');
    let hour = a.getHours().toString().padStart(2, '0');
    let min = a.getMinutes().toString().padStart(2, '0');
    let sec = a.getSeconds().toString().padStart(2, '0');
    let time = date + '/' + month + '/' + year + ' ' + hour + ':' + min + ':' + sec ;
    
    return time;
}
