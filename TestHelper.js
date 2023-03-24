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

function getDecodedString_Base64(encodedString) {
    return CryptoJS.enc.Base64.parse(encodedString).toString(CryptoJS.enc.Utf8);
}

function getDeepCopyOfObject(object) {
    return JSON.parse(JSON.stringify(object));
}

function parseRedirectionHtml(html) {
    const cheerioHtml = cheerio(html);
    const formData = {};
    cheerioHtml.find("form input").each((index, item) => {
        formData[item.attribs.name] = item.attribs.value;
    });
    
    return formData;
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

function getDuplicateOfCurrentRequest() {
    const method  = pm.request.method;
    const url   = pm.request.url.toString();

    const body = {};
    body['mode'] = pm.request.body.mode;
    body[pm.request.body.mode] = getDeepCopyOfObject(pm.request.body[pm.request.body.mode]);

    const duplicateRequest = {
        method,
        header: {
            'Content-Type': getCurrentRequestContentType()
        },
        url,
        body
    };

    return duplicateRequest;
}

function getCurrentRequestContentType() {
    let requestContentType = '';
    const requestBodyMode = pm.request.body.mode;

    switch (requestBodyMode) {
        case 'raw':
            const requestBodyFormat = pm.request.body[requestBodyMode]
            if (requestBodyFormat) {
                if (requestBodyFormat.startsWith('{')) {
                    requestContentType = 'application/json';
                } else if (requestBodyFormat.startsWith('<')) {
                    requestContentType = 'application/xml';
                }
                else {
                    requestContentType = 'text/plain';
                }
            }
            break;
        case 'formdata':
            requestContentType = 'multipart/form-data';
            break;
        case 'urlencoded':
            requestContentType = 'application/x-www-form-urlencoded';
            break;
        default:
            console.log('Unknown request body mode:', requestBodyMode);
    }

    return requestContentType;
}

function sendRequest(request) {
    return new Promise((resolve, reject) => {   
        try {
            pm.sendRequest(request, (error, response) => {
                if (!error) {
                    let promiseResponse = response.headers.get('Content-Type').startsWith('application/json') ?
                        response.json() : response.text();

                    resolve(promiseResponse);
                } else {
                    console.warn('Error executing request', error);
                }
            });
        } catch (error) {
            console.warn('Error executing request', error);
        }
    })
}

function buildPhpRequestParameters(object, requestParamatersContainer = [], requestParameterUnderConstruction = "") {
    let keys = Object.keys(object);

    keys.forEach(key => {
        let value = object[key];
        let requestParamterBase = "";

        if(!requestParameterUnderConstruction) {
            requestParamterBase = key;
        }
        else {
            requestParamterBase = requestParameterUnderConstruction + '[' + key + ']';
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            buildPhpRequestParameters(value, requestParamatersContainer, requestParamterBase)
        }
        else if(Array.isArray(value)) {
            value.forEach((arrayElement, index) => {
                 buildPhpRequestParameters(arrayElement, requestParamatersContainer, requestParamterBase + '[' + index + ']');
            });
        }
        else {
            if(value === null) {
                value = "";
            }

            requestParamatersContainer.push({ key : requestParamterBase, value : value });
        }
    });

    return requestParamatersContainer;
}

function isJavascriptObject(candidate) {
    return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

function hexadecimalToText(hexadecimal) {
    hexadecimal = hexadecimal.replace("0x", '');

    return Buffer.from(hexadecimal, 'hex').toString('utf8');
}
