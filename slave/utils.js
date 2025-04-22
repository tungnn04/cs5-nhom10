function getLastPage(linkHeader) {
    if (!linkHeader) return 1
    const parts = linkHeader.split(',');
    const lastLink = parts[parts.length - 1];
    const match = lastLink.match(/page=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



module.exports = { getLastPage, sleep}