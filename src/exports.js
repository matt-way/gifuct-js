// export wrapper for exposing library

var GIF = window.GIF || {};

GIF = require('./gif');

window.GIF = GIF;