/**
 * Convert image URI to blob for Firebase upload
 * @param {string} uri - The image URI
 * @returns {Promise<Blob>} - The blob object
 */
export const uriToBlob = (uri) => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () {
            resolve(xhr.response);
        };
        xhr.onerror = function () {
            reject(new Error('Failed to convert URI to blob'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
    });
};

/**
 * Get file extension from URI or MIME type
 * @param {string} uri - The file URI
 * @param {string} mimeType - The MIME type
 * @returns {string} - The file extension
 */
export const getFileExtension = (uri, mimeType) => {
    if (uri && uri.includes('.')) {
        const parts = uri.split('.');
        return parts[parts.length - 1].split('?')[0];
    }

    if (mimeType) {
        const mimeToExt = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf'
        };
        return mimeToExt[mimeType] || 'jpg';
    }

    return 'jpg';
};
