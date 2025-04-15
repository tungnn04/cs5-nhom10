function getLastPage(linkHeader) {
    if (!linkHeader) return 1
    const parts = linkHeader.split(',');
    const lastLink = parts[parts.length - 1];
    const match = lastLink.match(/page=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}


function debounce(fn, delay) {
    let sharedPromise = null;
    let timeoutId = null;

    return (...args) => {
        if(sharedPromise) {
            return sharedPromise;
        }
        sharedPromise = fn(...args);
        timeoutId = setTimeout(() => {
            sharedPromise = null;
            timeoutId = null;
        }, delay);
        return sharedPromise;
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}







module.exports = { getLastPage, debounce, sleep}