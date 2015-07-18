// user canvas
var c = document.getElementById('c');
var ctx = c.getContext('2d');
// gif patch canvas
var tempCanvas = document.createElement('canvas');
var tempCtx = tempCanvas.getContext('2d');
// full gif canvas
var gifCanvas = document.createElement('canvas');
var gifCtx = gifCanvas.getContext('2d');

var url = document.getElementById('url');
// default gif
url.value = '/demo/jblack.gif';

// load the default gif
loadGIF();

// load a gif with the current input url value
function loadGIF(){
	var oReq = new XMLHttpRequest();
	oReq.open("GET", url.value, true);
	oReq.responseType = "arraybuffer";

	oReq.onload = function (oEvent) {
	    var arrayBuffer = oReq.response; // Note: not oReq.responseText
	    if (arrayBuffer) {
	        var byteArray = new Uint8Array(arrayBuffer);
	        var gif = new GIF(byteArray);
	        var frames = gif.decompressFrames(true);
	        // render the gif
	        renderGIF(frames);
	    }
	};

	oReq.send(null);	
}

var playing = false;
var bInvert = false;
var bGrayscale = false;
var pixelPercent = 20;
var loadedFrames;
var frameIndex;

function playpause(){
	playing = !playing;
	if(playing){
		renderFrame();
	}
}

function renderGIF(frames){
	loadedFrames = frames;
	frameIndex = 0;

	c.width = frames[0].dims.width;
	c.height = frames[0].dims.height;

	gifCanvas.width = c.width;
	gifCanvas.height = c.height;

	if(!playing){
		playpause();
	}
}

var frameImageData;

function drawPatch(frame){
	var dims = frame.dims;
	
	if(!frameImageData || dims.width != frameImageData.width || dims.height != frameImageData.height){
		tempCanvas.width = dims.width;
		tempCanvas.height = dims.height;
		frameImageData = tempCtx.createImageData(dims.width, dims.height);	
	}
	
	// set the patch data as an override
	frameImageData.data.set(frame.patch);

	// draw the patch back over the canvas
	tempCtx.putImageData(frameImageData, 0, 0);

	gifCtx.drawImage(tempCanvas, dims.left, dims.top);
}

var invert = function(data) {
	for (var i = 0; i < data.length; i += 4) {
		data[i]     = 255 - data[i];     // red
		data[i + 1] = 255 - data[i + 1]; // green
		data[i + 2] = 255 - data[i + 2]; // blue
		data[i + 3] = 255;
	}
};

var grayscale = function(data) {
	for (var i = 0; i < data.length; i += 4) {
		var avg = (data[i] + data[i +1] + data[i +2]) / 3;
		data[i]     = avg; // red
		data[i + 1] = avg; // green
		data[i + 2] = avg; // blue
		data[i + 3] = 255;
	}
};

function manipulate(){
	var imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);

	if(bInvert){
		invert(imageData.data);	
	}

	if(bGrayscale){
		grayscale(imageData.data);
	}

	// do pixelation
	var pixelsX = 5 + Math.floor(pixelPercent / 100 * (c.width - 5));
	var pixelsY = (pixelsX * c.height) / c.width;

	if(pixelPercent != 100){
		ctx.mozImageSmoothingEnabled = false;
		ctx.webkitImageSmoothingEnabled = false;
		ctx.imageSmoothingEnabled = false;
	}

	ctx.putImageData(imageData, 0, 0);
	ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, pixelsX, pixelsY);
	ctx.drawImage(c, 0, 0, pixelsX, pixelsY, 0, 0, c.width, c.height);
}

function renderFrame(){
	// get the frame
	var frame = loadedFrames[frameIndex];

	var start = new Date().getTime();

	// draw the patch
	drawPatch(frame);

	// perform manipulation
	manipulate();

	// update the frame index
	frameIndex++;
	if(frameIndex >= loadedFrames.length){
		frameIndex = 0;
	}

	var end = new Date().getTime();
	var diff = end - start;

	if(playing){
		// delay the next gif frame
		setTimeout(function(){
			//requestAnimationFrame(renderFrame);
			renderFrame();
		}, Math.max(0, Math.floor(frame.delay - diff)));
	}
}
