(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

// Stream object for reading off bytes from a byte array

function ByteStream(data){
	this.data = data;
	this.pos = 0;
}

// read the next byte off the stream
ByteStream.prototype.readByte = function(){
	return this.data[this.pos++];
};

// look at the next byte in the stream without updating the stream position
ByteStream.prototype.peekByte = function(){
	return this.data[this.pos];
};

// read an array of bytes
ByteStream.prototype.readBytes = function(n){
	var bytes = new Array(n);
	for(var i=0; i<n; i++){
		bytes[i] = this.readByte();
	}
	return bytes;
};

// peek at an array of bytes without updating the stream position
ByteStream.prototype.peekBytes = function(n){
	var bytes = new Array(n);
	for(var i=0; i<n; i++){
		bytes[i] = this.data[this.pos + i];
	}
	return bytes;
};

// read a string from a byte set
ByteStream.prototype.readString = function(len){
	var str = '';
	for(var i=0; i<len; i++){
		str += String.fromCharCode(this.readByte());
	}
	return str;
};

// read a single byte and return an array of bit booleans
ByteStream.prototype.readBitArray = function(){
	var arr = [];
	var bite = this.readByte();
	for (var i = 7; i >= 0; i--) {
		arr.push(!!(bite & (1 << i)));
	}
	return arr;
};

// read an unsigned int with endian option
ByteStream.prototype.readUnsigned = function(littleEndian){
	var a = this.readBytes(2);
	if(littleEndian){
		return (a[1] << 8) + a[0];	
	}else{
		return (a[0] << 8) + a[1];
	}	
};

module.exports = ByteStream;
},{}],2:[function(require,module,exports){

// Primary data parsing object used to parse byte arrays

var ByteStream = require('./bytestream');

function DataParser(data){
	this.stream = new ByteStream(data);
	// the final parsed object from the data
	this.output = {};
}

DataParser.prototype.parse = function(schema){
	// the top level schema is just the top level parts array
	this.parseParts(this.output, schema);	
	return this.output;
};

// parse a set of hierarchy parts providing the parent object, and the subschema
DataParser.prototype.parseParts = function(obj, schema){
	for(var i=0; i<schema.length; i++){
		var part = schema[i];
		this.parsePart(obj, part); 
	}
};

DataParser.prototype.parsePart = function(obj, part){
	var name = part.label;
	var value;

	// make sure the part meets any parse requirements
	if(part.requires && ! part.requires(this.stream, this.output, obj)){
		return;
	}
	
	if(part.loop){
		// create a parse loop over the parts
		var items = [];
		while(part.loop(this.stream)){
			var item = {};
			this.parseParts(item, part.parts);
			items.push(item);
		}
		obj[name] = items;
	}else if(part.parts){
		// process any child parts
		value = {};
		this.parseParts(value, part.parts);
		obj[name] = value;
	}else if(part.parser){
		// parse the value using a parser
		value = part.parser(this.stream, this.output, obj);
		if(!part.skip){
			obj[name] = value;
		}
	}else if(part.bits){
		// convert the next byte to a set of bit fields
		obj[name] = this.parseBits(part.bits);
	}
};

// combine bits to calculate value
function bitsToNum(bitArray){
	return bitArray.reduce(function(s, n) { return s * 2 + n; }, 0);
}

// parse a byte as a bit set (flags and values)
DataParser.prototype.parseBits = function(details){
	var out = {};
	var bits = this.stream.readBitArray();
	for(var key in details){
		var item = details[key];
		if(item.length){
			// convert the bit set to value
			out[key] = bitsToNum(bits.slice(item.index, item.index + item.length));
		}else{
			out[key] = bits[item.index];
		}
	}
	return out;
};

module.exports = DataParser;
},{"./bytestream":1}],3:[function(require,module,exports){

// a set of common parsers used with DataParser

var Parsers = {
	// read a byte
	readByte: function(){
		return function(stream){
			return stream.readByte();
		};
	},
	// read an array of bytes
	readBytes: function(length){
		return function(stream){
			return stream.readBytes(length);
		};
	},
	// read a string from bytes
	readString: function(length){
		return function(stream){
			return stream.readString(length);
		};
	},
	// read an unsigned int (with endian)
	readUnsigned: function(littleEndian){
		return function(stream){
			return stream.readUnsigned(littleEndian);
		};
	},
	// read an array of byte sets
	readArray: function(size, countFunc){
		return function(stream, obj, parent){
			var count = countFunc(stream, obj, parent);
			var arr = new Array(count);
			for(var i=0; i<count; i++){
				arr[i] = stream.readBytes(size);
			}
			return arr;
		};
	}
};A

module.exports = Parsers;
},{}],4:[function(require,module,exports){
// export wrapper for exposing library

var GIF = window.GIF || {};

GIF = require('./gif');

window.GIF = GIF;
},{"./gif":5}],5:[function(require,module,exports){

// object used to represent array buffer data for a gif file

var DataParser = require('../bower_components/js-binary-schema-parser/src/dataparser');
var gifSchema = require('./schema');

function GIF(arrayBuffer){
	// convert to byte array
	var byteData = new Uint8Array(arrayBuffer);
	var parser = new DataParser(byteData);
	// parse the data
	this.raw = parser.parse(gifSchema);

	// set a flag to make sure the gif contains at least one image
	this.raw.hasImages = false;
	for(var f=0; f<this.raw.frames.length; f++){
		if(this.raw.frames[f].image){
			this.raw.hasImages = true;
			break;
		}
	}
}

// process a single gif image frames data, decompressing it using LZW 
GIF.prototype.decompressFrame = function(index){

	// make sure a valid frame is requested
	if(index >= this.raw.frames.length){ return null; }

	var frame = this.raw.frames[index];
	if(frame.image){
		// get the number of pixels
		var totalPixels = frame.image.descriptor.width * frame.image.descriptor.height;

		// do lzw decompression
		var pixels = lzw(frame.image.data.minCodeSize, frame.image.data.blocks, totalPixels);

		// deal with interlacing if necessary
		if(frame.image.descriptor.lct.interlaced){
			pixels = deinterlace(pixels, frame.image.descriptor.width);
		}

		// setup usable image object
		var image = {
			pixels: pixels,
			dims: frame.image.descriptor
		};

		// add per frame relevant gce information
		if(frame.gce){
			image.delay = frame.gce.delay * 10; // convert to ms
			image.disposalType = frame.gce.extras.disposal;
		}

		return image;		
	}

	// frame does not contains image
	return null;	


	/**
	 * javascript port of java LZW decompression
	 * Original java author url: https://gist.github.com/devunwired/4479231
	 */	
	function lzw(minCodeSize, data, pixelCount) {
 		
 		var MAX_STACK_SIZE = 4096;
		var nullCode = -1;

		var npix = pixelCount;
		var available, clear, code_mask, code_size, end_of_information, in_code, old_code, bits, code, count, i, datum, data_size, first, top, bi, pi;
 
 		var dstPixels = new Array(pixelCount);
		var prefix = new Array(MAX_STACK_SIZE);
		var suffix = new Array(MAX_STACK_SIZE);
		var pixelStack = new Array(MAX_STACK_SIZE + 1);
 
		// Initialize GIF data stream decoder.
		data_size = minCodeSize;
		clear = 1 << data_size;
		end_of_information = clear + 1;
		available = clear + 2;
		old_code = nullCode;
		code_size = data_size + 1;
		code_mask = (1 << code_size) - 1;
		for (code = 0; code < clear; code++) {
			prefix[code] = 0;
			suffix[code] = code;
		}
 
		// Decode GIF pixel stream.
		datum = bits = count = first = top = pi = bi = 0;
		for (i = 0; i < npix; ) {
			if (top === 0) {
				if (bits < code_size) {
					
					// get the next byte			
					datum += data[bi] << bits;

					bits += 8;
					bi++;
					count--;
					continue;
				}
				// Get the next code.
				code = datum & code_mask;
				datum >>= code_size;
				bits -= code_size;
				// Interpret the code
				if ((code > available) || (code == end_of_information)) {
					break;
				}
				if (code == clear) {
					// Reset decoder.
					code_size = data_size + 1;
					code_mask = (1 << code_size) - 1;
					available = clear + 2;
					old_code = nullCode;
					continue;
				}
				if (old_code == nullCode) {
					pixelStack[top++] = suffix[code];
					old_code = code;
					first = code;
					continue;
				}
				in_code = code;
				if (code == available) {
					pixelStack[top++] = first;
					code = old_code;
				}
				while (code > clear) {
					pixelStack[top++] = suffix[code];
					code = prefix[code];
				}
				
				first = suffix[code] & 0xff;

				// Add a new string to the string table,
				if (available >= MAX_STACK_SIZE) {
					break;
				}
				
				pixelStack[top++] = first;
				prefix[available] = old_code;
				suffix[available] = first;
				available++;
				if (((available & code_mask) === 0) && (available < MAX_STACK_SIZE)) {
					code_size++;
					code_mask += available;
				}
				old_code = in_code;
			}
			// Pop a pixel off the pixel stack.
			top--;
			dstPixels[pi++] = pixelStack[top];
			i++;
		}
 
		for (i = pi; i < npix; i++) {
			dstPixels[i] = 0; // clear missing pixels
		}

		return dstPixels;
	}

	// deinterlace function from https://github.com/shachaf/jsgif
	function deinterlace(pixels, width) {
		
		var newPixels = new Array(pixels.length);
		var rows = pixels.length / width;
		var cpRow = function(toRow, fromRow) {
			var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
			newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
		};

		// See appendix E.
		var offsets = [0,4,2,1];
		var steps   = [8,8,4,2];

		var fromRow = 0;
		for (var pass = 0; pass < 4; pass++) {
			for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
				cpRow(toRow, fromRow);
				fromRow++;
			}
		}

		return newPixels;
	}
};

// returns all frames decompressed
GIF.prototype.decompressFrames = function(){
	var frames = [];
	for(var i=0; i<this.raw.frames.length; i++){
		var frame = this.raw.frames[i];
		if(frame.image){
			frames.push(this.decompressFrame(i));
		}
	}
	return frames;
};

module.exports = GIF;
},{"../bower_components/js-binary-schema-parser/src/dataparser":2,"./schema":6}],6:[function(require,module,exports){

// Schema for the js file parser to use to parse gif files
// For js object convenience (re-use), the schema objects are approximately reverse ordered

// common parsers available
var Parsers = require('../bower_components/js-binary-schema-parser/src/parsers');

// a set of 0x00 terminated subblocks
var subBlocks = {
	label: 'blocks',
	parser: function(stream){
		var out = [];
		var terminator = 0x00;		
		for(var size=stream.readByte(); size!==terminator; size=stream.readByte()){
			out = out.concat(stream.readBytes(size));
		}
		return out;
	}
};

// global control extension
var gce = {
	label: 'gce',
	requires: function(stream){
		// just peek at the top two bytes, and if true do this
		var codes = stream.peekBytes(2);
		return codes[0] === 0x21 && codes[1] === 0xF9;
	},
	parts: [
		{ label: 'codes', parser: Parsers.readBytes(2), skip: true },
		{ label: 'byteSize', parser: Parsers.readByte() },
		{ label: 'extras', bits: {
			future: { index: 0, length: 3 },
			disposal: { index: 3, length: 3 },
			userInput: { index: 6 },
			transparentColorGiven: { index: 7 }
		}},
		{ label: 'delay', parser: Parsers.readUnsigned(true) },
		{ label: 'transparentColorIndex', parser: Parsers.readByte() },
		{ label: 'terminator', parser: Parsers.readByte(), skip: true }
	]
};

// image pipeline block
var image = {
	label: 'image',
	requires: function(stream){
		// peek at the next byte
		var code = stream.peekByte();
		return code === 0x2C;
	},
	parts: [
		{ label: 'code', parser: Parsers.readByte(), skip: true },
		{
			label: 'descriptor', // image descriptor
			parts: [
				{ label: 'left', parser: Parsers.readUnsigned(true) },
				{ label: 'top', parser: Parsers.readUnsigned(true) },
				{ label: 'width', parser: Parsers.readUnsigned(true) },
				{ label: 'height', parser: Parsers.readUnsigned(true) },
				{ label: 'lct', bits: {
					exists: { index: 0 },
					interlaced: { index: 1 },
					sort: { index: 2 },
					future: { index: 3, length: 2 },
					size: { index: 5, length: 3 }
				}}
			]
		},{
			label: 'lct', // optional local color table
			requires: function(stream, obj, parent){
				return parent.descriptor.lct.exists;
			},
			parser: Parsers.readArray(3, function(stream, obj, parent){
				return Math.pow(2, parent.descriptor.lct.size + 1);
			})
		},{
			label: 'data', // the image data blocks
			parts: [
				{ label: 'minCodeSize', parser: Parsers.readByte() },
				subBlocks
			]
		}
	]
};

// plain text block
var text = {
	label: 'text',
	requires: function(stream){
		// just peek at the top two bytes, and if true do this
		var codes = stream.peekBytes(2);
		return codes[0] === 0x21 && codes[1] === 0x01;
	},
	parts: [
		{ label: 'codes', parser: Parsers.readBytes(2), skip: true },
		{ label: 'blockSize', parser: Parsers.readByte() },
		{ 
			label: 'preData', 
			parser: function(stream, obj, parent){
				return stream.readBytes(parent.text.blockSize);
			}
		},
		subBlocks
	]
};

// application block
var application = {
	label: 'application',
	requires: function(stream, obj, parent){
		// make sure this frame doesn't already have a gce, text, comment, or image
		// as that means this block should be attached to the next frame
		//if(parent.gce || parent.text || parent.image || parent.comment){ return false; }

		// peek at the top two bytes
		var codes = stream.peekBytes(2);
		return codes[0] === 0x21 && codes[1] === 0xFF;
	},
	parts: [
		{ label: 'codes', parser: Parsers.readBytes(2), skip: true },
		{ label: 'blockSize', parser: Parsers.readByte() },
		{ 
			label: 'id', 
			parser: function(stream, obj, parent){
				return stream.readString(parent.blockSize);
			}
		},
		subBlocks
	]
};

// comment block
var comment = {
	label: 'comment',
	requires: function(stream, obj, parent){
		// make sure this frame doesn't already have a gce, text, comment, or image
		// as that means this block should be attached to the next frame
		//if(parent.gce || parent.text || parent.image || parent.comment){ return false; }

		// peek at the top two bytes
		var codes = stream.peekBytes(2);
		return codes[0] === 0x21 && codes[1] === 0xFE;
	},
	parts: [
		{ label: 'codes', parser: Parsers.readBytes(2), skip: true },
		subBlocks
	]
};

// frames of ext and image data
var frames = {
	label: 'frames',
	parts: [
		gce,
		application,
		comment,
		image,
		text
	],
	loop: function(stream){
		var nextCode = stream.peekByte();
		// rather than check for a terminator, we should check for the existence
		// of an ext or image block to avoid infinite loops
		//var terminator = 0x3B;
		//return nextCode !== terminator;
		return nextCode === 0x21 || nextCode === 0x2C;
	}
};

// main GIF schema
var schemaGIF = [
	{
		label: 'header', // gif header
		parts: [
			{ label: 'signature', parser: Parsers.readString(3) },
			{ label: 'version', parser: Parsers.readString(3) }
		]
	},{
		label: 'lsd', // local screen descriptor
		parts: [
			{ label: 'width', parser: Parsers.readUnsigned(true) },
			{ label: 'height', parser: Parsers.readUnsigned(true) },
			{ label: 'gct', bits: {
				exists: { index: 0 },
				resolution: { index: 1, length: 3 },
				sort: { index: 4 },
				size: { index: 5, length: 3 }
			}},
			{ label: 'backgroundColorIndex', parser: Parsers.readByte() },
			{ label: 'pixelAspectRatio', parser: Parsers.readByte() }
		]
	},{
		label: 'gct', // global color table
		requires: function(stream, obj){
			return obj.lsd.gct.exists;
		},
		parser: Parsers.readArray(3, function(stream, obj){
			return Math.pow(2, obj.lsd.gct.size + 1);
		})
	},
	frames // content frames
];

module.exports = schemaGIF;
},{"../bower_components/js-binary-schema-parser/src/parsers":3}]},{},[4])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJib3dlcl9jb21wb25lbnRzL2pzLWJpbmFyeS1zY2hlbWEtcGFyc2VyL3NyYy9ieXRlc3RyZWFtLmpzIiwiYm93ZXJfY29tcG9uZW50cy9qcy1iaW5hcnktc2NoZW1hLXBhcnNlci9zcmMvZGF0YXBhcnNlci5qcyIsImJvd2VyX2NvbXBvbmVudHMvanMtYmluYXJ5LXNjaGVtYS1wYXJzZXIvc3JjL3BhcnNlcnMuanMiLCJzcmMvZXhwb3J0cy5qcyIsInNyYy9naWYuanMiLCJzcmMvc2NoZW1hLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbi8vIFN0cmVhbSBvYmplY3QgZm9yIHJlYWRpbmcgb2ZmIGJ5dGVzIGZyb20gYSBieXRlIGFycmF5XG5cbmZ1bmN0aW9uIEJ5dGVTdHJlYW0oZGF0YSl7XG5cdHRoaXMuZGF0YSA9IGRhdGE7XG5cdHRoaXMucG9zID0gMDtcbn1cblxuLy8gcmVhZCB0aGUgbmV4dCBieXRlIG9mZiB0aGUgc3RyZWFtXG5CeXRlU3RyZWFtLnByb3RvdHlwZS5yZWFkQnl0ZSA9IGZ1bmN0aW9uKCl7XG5cdHJldHVybiB0aGlzLmRhdGFbdGhpcy5wb3MrK107XG59O1xuXG4vLyBsb29rIGF0IHRoZSBuZXh0IGJ5dGUgaW4gdGhlIHN0cmVhbSB3aXRob3V0IHVwZGF0aW5nIHRoZSBzdHJlYW0gcG9zaXRpb25cbkJ5dGVTdHJlYW0ucHJvdG90eXBlLnBlZWtCeXRlID0gZnVuY3Rpb24oKXtcblx0cmV0dXJuIHRoaXMuZGF0YVt0aGlzLnBvc107XG59O1xuXG4vLyByZWFkIGFuIGFycmF5IG9mIGJ5dGVzXG5CeXRlU3RyZWFtLnByb3RvdHlwZS5yZWFkQnl0ZXMgPSBmdW5jdGlvbihuKXtcblx0dmFyIGJ5dGVzID0gbmV3IEFycmF5KG4pO1xuXHRmb3IodmFyIGk9MDsgaTxuOyBpKyspe1xuXHRcdGJ5dGVzW2ldID0gdGhpcy5yZWFkQnl0ZSgpO1xuXHR9XG5cdHJldHVybiBieXRlcztcbn07XG5cbi8vIHBlZWsgYXQgYW4gYXJyYXkgb2YgYnl0ZXMgd2l0aG91dCB1cGRhdGluZyB0aGUgc3RyZWFtIHBvc2l0aW9uXG5CeXRlU3RyZWFtLnByb3RvdHlwZS5wZWVrQnl0ZXMgPSBmdW5jdGlvbihuKXtcblx0dmFyIGJ5dGVzID0gbmV3IEFycmF5KG4pO1xuXHRmb3IodmFyIGk9MDsgaTxuOyBpKyspe1xuXHRcdGJ5dGVzW2ldID0gdGhpcy5kYXRhW3RoaXMucG9zICsgaV07XG5cdH1cblx0cmV0dXJuIGJ5dGVzO1xufTtcblxuLy8gcmVhZCBhIHN0cmluZyBmcm9tIGEgYnl0ZSBzZXRcbkJ5dGVTdHJlYW0ucHJvdG90eXBlLnJlYWRTdHJpbmcgPSBmdW5jdGlvbihsZW4pe1xuXHR2YXIgc3RyID0gJyc7XG5cdGZvcih2YXIgaT0wOyBpPGxlbjsgaSsrKXtcblx0XHRzdHIgKz0gU3RyaW5nLmZyb21DaGFyQ29kZSh0aGlzLnJlYWRCeXRlKCkpO1xuXHR9XG5cdHJldHVybiBzdHI7XG59O1xuXG4vLyByZWFkIGEgc2luZ2xlIGJ5dGUgYW5kIHJldHVybiBhbiBhcnJheSBvZiBiaXQgYm9vbGVhbnNcbkJ5dGVTdHJlYW0ucHJvdG90eXBlLnJlYWRCaXRBcnJheSA9IGZ1bmN0aW9uKCl7XG5cdHZhciBhcnIgPSBbXTtcblx0dmFyIGJpdGUgPSB0aGlzLnJlYWRCeXRlKCk7XG5cdGZvciAodmFyIGkgPSA3OyBpID49IDA7IGktLSkge1xuXHRcdGFyci5wdXNoKCEhKGJpdGUgJiAoMSA8PCBpKSkpO1xuXHR9XG5cdHJldHVybiBhcnI7XG59O1xuXG4vLyByZWFkIGFuIHVuc2lnbmVkIGludCB3aXRoIGVuZGlhbiBvcHRpb25cbkJ5dGVTdHJlYW0ucHJvdG90eXBlLnJlYWRVbnNpZ25lZCA9IGZ1bmN0aW9uKGxpdHRsZUVuZGlhbil7XG5cdHZhciBhID0gdGhpcy5yZWFkQnl0ZXMoMik7XG5cdGlmKGxpdHRsZUVuZGlhbil7XG5cdFx0cmV0dXJuIChhWzFdIDw8IDgpICsgYVswXTtcdFxuXHR9ZWxzZXtcblx0XHRyZXR1cm4gKGFbMF0gPDwgOCkgKyBhWzFdO1xuXHR9XHRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQnl0ZVN0cmVhbTsiLCJcbi8vIFByaW1hcnkgZGF0YSBwYXJzaW5nIG9iamVjdCB1c2VkIHRvIHBhcnNlIGJ5dGUgYXJyYXlzXG5cbnZhciBCeXRlU3RyZWFtID0gcmVxdWlyZSgnLi9ieXRlc3RyZWFtJyk7XG5cbmZ1bmN0aW9uIERhdGFQYXJzZXIoZGF0YSl7XG5cdHRoaXMuc3RyZWFtID0gbmV3IEJ5dGVTdHJlYW0oZGF0YSk7XG5cdC8vIHRoZSBmaW5hbCBwYXJzZWQgb2JqZWN0IGZyb20gdGhlIGRhdGFcblx0dGhpcy5vdXRwdXQgPSB7fTtcbn1cblxuRGF0YVBhcnNlci5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbihzY2hlbWEpe1xuXHQvLyB0aGUgdG9wIGxldmVsIHNjaGVtYSBpcyBqdXN0IHRoZSB0b3AgbGV2ZWwgcGFydHMgYXJyYXlcblx0dGhpcy5wYXJzZVBhcnRzKHRoaXMub3V0cHV0LCBzY2hlbWEpO1x0XG5cdHJldHVybiB0aGlzLm91dHB1dDtcbn07XG5cbi8vIHBhcnNlIGEgc2V0IG9mIGhpZXJhcmNoeSBwYXJ0cyBwcm92aWRpbmcgdGhlIHBhcmVudCBvYmplY3QsIGFuZCB0aGUgc3Vic2NoZW1hXG5EYXRhUGFyc2VyLnByb3RvdHlwZS5wYXJzZVBhcnRzID0gZnVuY3Rpb24ob2JqLCBzY2hlbWEpe1xuXHRmb3IodmFyIGk9MDsgaTxzY2hlbWEubGVuZ3RoOyBpKyspe1xuXHRcdHZhciBwYXJ0ID0gc2NoZW1hW2ldO1xuXHRcdHRoaXMucGFyc2VQYXJ0KG9iaiwgcGFydCk7IFxuXHR9XG59O1xuXG5EYXRhUGFyc2VyLnByb3RvdHlwZS5wYXJzZVBhcnQgPSBmdW5jdGlvbihvYmosIHBhcnQpe1xuXHR2YXIgbmFtZSA9IHBhcnQubGFiZWw7XG5cdHZhciB2YWx1ZTtcblxuXHQvLyBtYWtlIHN1cmUgdGhlIHBhcnQgbWVldHMgYW55IHBhcnNlIHJlcXVpcmVtZW50c1xuXHRpZihwYXJ0LnJlcXVpcmVzICYmICEgcGFydC5yZXF1aXJlcyh0aGlzLnN0cmVhbSwgdGhpcy5vdXRwdXQsIG9iaikpe1xuXHRcdHJldHVybjtcblx0fVxuXHRcblx0aWYocGFydC5sb29wKXtcblx0XHQvLyBjcmVhdGUgYSBwYXJzZSBsb29wIG92ZXIgdGhlIHBhcnRzXG5cdFx0dmFyIGl0ZW1zID0gW107XG5cdFx0d2hpbGUocGFydC5sb29wKHRoaXMuc3RyZWFtKSl7XG5cdFx0XHR2YXIgaXRlbSA9IHt9O1xuXHRcdFx0dGhpcy5wYXJzZVBhcnRzKGl0ZW0sIHBhcnQucGFydHMpO1xuXHRcdFx0aXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0b2JqW25hbWVdID0gaXRlbXM7XG5cdH1lbHNlIGlmKHBhcnQucGFydHMpe1xuXHRcdC8vIHByb2Nlc3MgYW55IGNoaWxkIHBhcnRzXG5cdFx0dmFsdWUgPSB7fTtcblx0XHR0aGlzLnBhcnNlUGFydHModmFsdWUsIHBhcnQucGFydHMpO1xuXHRcdG9ialtuYW1lXSA9IHZhbHVlO1xuXHR9ZWxzZSBpZihwYXJ0LnBhcnNlcil7XG5cdFx0Ly8gcGFyc2UgdGhlIHZhbHVlIHVzaW5nIGEgcGFyc2VyXG5cdFx0dmFsdWUgPSBwYXJ0LnBhcnNlcih0aGlzLnN0cmVhbSwgdGhpcy5vdXRwdXQsIG9iaik7XG5cdFx0aWYoIXBhcnQuc2tpcCl7XG5cdFx0XHRvYmpbbmFtZV0gPSB2YWx1ZTtcblx0XHR9XG5cdH1lbHNlIGlmKHBhcnQuYml0cyl7XG5cdFx0Ly8gY29udmVydCB0aGUgbmV4dCBieXRlIHRvIGEgc2V0IG9mIGJpdCBmaWVsZHNcblx0XHRvYmpbbmFtZV0gPSB0aGlzLnBhcnNlQml0cyhwYXJ0LmJpdHMpO1xuXHR9XG59O1xuXG4vLyBjb21iaW5lIGJpdHMgdG8gY2FsY3VsYXRlIHZhbHVlXG5mdW5jdGlvbiBiaXRzVG9OdW0oYml0QXJyYXkpe1xuXHRyZXR1cm4gYml0QXJyYXkucmVkdWNlKGZ1bmN0aW9uKHMsIG4pIHsgcmV0dXJuIHMgKiAyICsgbjsgfSwgMCk7XG59XG5cbi8vIHBhcnNlIGEgYnl0ZSBhcyBhIGJpdCBzZXQgKGZsYWdzIGFuZCB2YWx1ZXMpXG5EYXRhUGFyc2VyLnByb3RvdHlwZS5wYXJzZUJpdHMgPSBmdW5jdGlvbihkZXRhaWxzKXtcblx0dmFyIG91dCA9IHt9O1xuXHR2YXIgYml0cyA9IHRoaXMuc3RyZWFtLnJlYWRCaXRBcnJheSgpO1xuXHRmb3IodmFyIGtleSBpbiBkZXRhaWxzKXtcblx0XHR2YXIgaXRlbSA9IGRldGFpbHNba2V5XTtcblx0XHRpZihpdGVtLmxlbmd0aCl7XG5cdFx0XHQvLyBjb252ZXJ0IHRoZSBiaXQgc2V0IHRvIHZhbHVlXG5cdFx0XHRvdXRba2V5XSA9IGJpdHNUb051bShiaXRzLnNsaWNlKGl0ZW0uaW5kZXgsIGl0ZW0uaW5kZXggKyBpdGVtLmxlbmd0aCkpO1xuXHRcdH1lbHNle1xuXHRcdFx0b3V0W2tleV0gPSBiaXRzW2l0ZW0uaW5kZXhdO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBEYXRhUGFyc2VyOyIsIlxuLy8gYSBzZXQgb2YgY29tbW9uIHBhcnNlcnMgdXNlZCB3aXRoIERhdGFQYXJzZXJcblxudmFyIFBhcnNlcnMgPSB7XG5cdC8vIHJlYWQgYSBieXRlXG5cdHJlYWRCeXRlOiBmdW5jdGlvbigpe1xuXHRcdHJldHVybiBmdW5jdGlvbihzdHJlYW0pe1xuXHRcdFx0cmV0dXJuIHN0cmVhbS5yZWFkQnl0ZSgpO1xuXHRcdH07XG5cdH0sXG5cdC8vIHJlYWQgYW4gYXJyYXkgb2YgYnl0ZXNcblx0cmVhZEJ5dGVzOiBmdW5jdGlvbihsZW5ndGgpe1xuXHRcdHJldHVybiBmdW5jdGlvbihzdHJlYW0pe1xuXHRcdFx0cmV0dXJuIHN0cmVhbS5yZWFkQnl0ZXMobGVuZ3RoKTtcblx0XHR9O1xuXHR9LFxuXHQvLyByZWFkIGEgc3RyaW5nIGZyb20gYnl0ZXNcblx0cmVhZFN0cmluZzogZnVuY3Rpb24obGVuZ3RoKXtcblx0XHRyZXR1cm4gZnVuY3Rpb24oc3RyZWFtKXtcblx0XHRcdHJldHVybiBzdHJlYW0ucmVhZFN0cmluZyhsZW5ndGgpO1xuXHRcdH07XG5cdH0sXG5cdC8vIHJlYWQgYW4gdW5zaWduZWQgaW50ICh3aXRoIGVuZGlhbilcblx0cmVhZFVuc2lnbmVkOiBmdW5jdGlvbihsaXR0bGVFbmRpYW4pe1xuXHRcdHJldHVybiBmdW5jdGlvbihzdHJlYW0pe1xuXHRcdFx0cmV0dXJuIHN0cmVhbS5yZWFkVW5zaWduZWQobGl0dGxlRW5kaWFuKTtcblx0XHR9O1xuXHR9LFxuXHQvLyByZWFkIGFuIGFycmF5IG9mIGJ5dGUgc2V0c1xuXHRyZWFkQXJyYXk6IGZ1bmN0aW9uKHNpemUsIGNvdW50RnVuYyl7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uKHN0cmVhbSwgb2JqLCBwYXJlbnQpe1xuXHRcdFx0dmFyIGNvdW50ID0gY291bnRGdW5jKHN0cmVhbSwgb2JqLCBwYXJlbnQpO1xuXHRcdFx0dmFyIGFyciA9IG5ldyBBcnJheShjb3VudCk7XG5cdFx0XHRmb3IodmFyIGk9MDsgaTxjb3VudDsgaSsrKXtcblx0XHRcdFx0YXJyW2ldID0gc3RyZWFtLnJlYWRCeXRlcyhzaXplKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhcnI7XG5cdFx0fTtcblx0fVxufTtBXG5cbm1vZHVsZS5leHBvcnRzID0gUGFyc2VyczsiLCIvLyBleHBvcnQgd3JhcHBlciBmb3IgZXhwb3NpbmcgbGlicmFyeVxuXG52YXIgR0lGID0gd2luZG93LkdJRiB8fCB7fTtcblxuR0lGID0gcmVxdWlyZSgnLi9naWYnKTtcblxud2luZG93LkdJRiA9IEdJRjsiLCJcbi8vIG9iamVjdCB1c2VkIHRvIHJlcHJlc2VudCBhcnJheSBidWZmZXIgZGF0YSBmb3IgYSBnaWYgZmlsZVxuXG52YXIgRGF0YVBhcnNlciA9IHJlcXVpcmUoJy4uL2Jvd2VyX2NvbXBvbmVudHMvanMtYmluYXJ5LXNjaGVtYS1wYXJzZXIvc3JjL2RhdGFwYXJzZXInKTtcbnZhciBnaWZTY2hlbWEgPSByZXF1aXJlKCcuL3NjaGVtYScpO1xuXG5mdW5jdGlvbiBHSUYoYXJyYXlCdWZmZXIpe1xuXHQvLyBjb252ZXJ0IHRvIGJ5dGUgYXJyYXlcblx0dmFyIGJ5dGVEYXRhID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlCdWZmZXIpO1xuXHR2YXIgcGFyc2VyID0gbmV3IERhdGFQYXJzZXIoYnl0ZURhdGEpO1xuXHQvLyBwYXJzZSB0aGUgZGF0YVxuXHR0aGlzLnJhdyA9IHBhcnNlci5wYXJzZShnaWZTY2hlbWEpO1xuXG5cdC8vIHNldCBhIGZsYWcgdG8gbWFrZSBzdXJlIHRoZSBnaWYgY29udGFpbnMgYXQgbGVhc3Qgb25lIGltYWdlXG5cdHRoaXMucmF3Lmhhc0ltYWdlcyA9IGZhbHNlO1xuXHRmb3IodmFyIGY9MDsgZjx0aGlzLnJhdy5mcmFtZXMubGVuZ3RoOyBmKyspe1xuXHRcdGlmKHRoaXMucmF3LmZyYW1lc1tmXS5pbWFnZSl7XG5cdFx0XHR0aGlzLnJhdy5oYXNJbWFnZXMgPSB0cnVlO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG59XG5cbi8vIHByb2Nlc3MgYSBzaW5nbGUgZ2lmIGltYWdlIGZyYW1lcyBkYXRhLCBkZWNvbXByZXNzaW5nIGl0IHVzaW5nIExaVyBcbkdJRi5wcm90b3R5cGUuZGVjb21wcmVzc0ZyYW1lID0gZnVuY3Rpb24oaW5kZXgpe1xuXG5cdC8vIG1ha2Ugc3VyZSBhIHZhbGlkIGZyYW1lIGlzIHJlcXVlc3RlZFxuXHRpZihpbmRleCA+PSB0aGlzLnJhdy5mcmFtZXMubGVuZ3RoKXsgcmV0dXJuIG51bGw7IH1cblxuXHR2YXIgZnJhbWUgPSB0aGlzLnJhdy5mcmFtZXNbaW5kZXhdO1xuXHRpZihmcmFtZS5pbWFnZSl7XG5cdFx0Ly8gZ2V0IHRoZSBudW1iZXIgb2YgcGl4ZWxzXG5cdFx0dmFyIHRvdGFsUGl4ZWxzID0gZnJhbWUuaW1hZ2UuZGVzY3JpcHRvci53aWR0aCAqIGZyYW1lLmltYWdlLmRlc2NyaXB0b3IuaGVpZ2h0O1xuXG5cdFx0Ly8gZG8gbHp3IGRlY29tcHJlc3Npb25cblx0XHR2YXIgcGl4ZWxzID0gbHp3KGZyYW1lLmltYWdlLmRhdGEubWluQ29kZVNpemUsIGZyYW1lLmltYWdlLmRhdGEuYmxvY2tzLCB0b3RhbFBpeGVscyk7XG5cblx0XHQvLyBkZWFsIHdpdGggaW50ZXJsYWNpbmcgaWYgbmVjZXNzYXJ5XG5cdFx0aWYoZnJhbWUuaW1hZ2UuZGVzY3JpcHRvci5sY3QuaW50ZXJsYWNlZCl7XG5cdFx0XHRwaXhlbHMgPSBkZWludGVybGFjZShwaXhlbHMsIGZyYW1lLmltYWdlLmRlc2NyaXB0b3Iud2lkdGgpO1xuXHRcdH1cblxuXHRcdC8vIHNldHVwIHVzYWJsZSBpbWFnZSBvYmplY3Rcblx0XHR2YXIgaW1hZ2UgPSB7XG5cdFx0XHRwaXhlbHM6IHBpeGVscyxcblx0XHRcdGRpbXM6IGZyYW1lLmltYWdlLmRlc2NyaXB0b3Jcblx0XHR9O1xuXG5cdFx0Ly8gYWRkIHBlciBmcmFtZSByZWxldmFudCBnY2UgaW5mb3JtYXRpb25cblx0XHRpZihmcmFtZS5nY2Upe1xuXHRcdFx0aW1hZ2UuZGVsYXkgPSBmcmFtZS5nY2UuZGVsYXkgKiAxMDsgLy8gY29udmVydCB0byBtc1xuXHRcdFx0aW1hZ2UuZGlzcG9zYWxUeXBlID0gZnJhbWUuZ2NlLmV4dHJhcy5kaXNwb3NhbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW1hZ2U7XHRcdFxuXHR9XG5cblx0Ly8gZnJhbWUgZG9lcyBub3QgY29udGFpbnMgaW1hZ2Vcblx0cmV0dXJuIG51bGw7XHRcblxuXG5cdC8qKlxuXHQgKiBqYXZhc2NyaXB0IHBvcnQgb2YgamF2YSBMWlcgZGVjb21wcmVzc2lvblxuXHQgKiBPcmlnaW5hbCBqYXZhIGF1dGhvciB1cmw6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2RldnVud2lyZWQvNDQ3OTIzMVxuXHQgKi9cdFxuXHRmdW5jdGlvbiBsencobWluQ29kZVNpemUsIGRhdGEsIHBpeGVsQ291bnQpIHtcbiBcdFx0XG4gXHRcdHZhciBNQVhfU1RBQ0tfU0laRSA9IDQwOTY7XG5cdFx0dmFyIG51bGxDb2RlID0gLTE7XG5cblx0XHR2YXIgbnBpeCA9IHBpeGVsQ291bnQ7XG5cdFx0dmFyIGF2YWlsYWJsZSwgY2xlYXIsIGNvZGVfbWFzaywgY29kZV9zaXplLCBlbmRfb2ZfaW5mb3JtYXRpb24sIGluX2NvZGUsIG9sZF9jb2RlLCBiaXRzLCBjb2RlLCBjb3VudCwgaSwgZGF0dW0sIGRhdGFfc2l6ZSwgZmlyc3QsIHRvcCwgYmksIHBpO1xuIFxuIFx0XHR2YXIgZHN0UGl4ZWxzID0gbmV3IEFycmF5KHBpeGVsQ291bnQpO1xuXHRcdHZhciBwcmVmaXggPSBuZXcgQXJyYXkoTUFYX1NUQUNLX1NJWkUpO1xuXHRcdHZhciBzdWZmaXggPSBuZXcgQXJyYXkoTUFYX1NUQUNLX1NJWkUpO1xuXHRcdHZhciBwaXhlbFN0YWNrID0gbmV3IEFycmF5KE1BWF9TVEFDS19TSVpFICsgMSk7XG4gXG5cdFx0Ly8gSW5pdGlhbGl6ZSBHSUYgZGF0YSBzdHJlYW0gZGVjb2Rlci5cblx0XHRkYXRhX3NpemUgPSBtaW5Db2RlU2l6ZTtcblx0XHRjbGVhciA9IDEgPDwgZGF0YV9zaXplO1xuXHRcdGVuZF9vZl9pbmZvcm1hdGlvbiA9IGNsZWFyICsgMTtcblx0XHRhdmFpbGFibGUgPSBjbGVhciArIDI7XG5cdFx0b2xkX2NvZGUgPSBudWxsQ29kZTtcblx0XHRjb2RlX3NpemUgPSBkYXRhX3NpemUgKyAxO1xuXHRcdGNvZGVfbWFzayA9ICgxIDw8IGNvZGVfc2l6ZSkgLSAxO1xuXHRcdGZvciAoY29kZSA9IDA7IGNvZGUgPCBjbGVhcjsgY29kZSsrKSB7XG5cdFx0XHRwcmVmaXhbY29kZV0gPSAwO1xuXHRcdFx0c3VmZml4W2NvZGVdID0gY29kZTtcblx0XHR9XG4gXG5cdFx0Ly8gRGVjb2RlIEdJRiBwaXhlbCBzdHJlYW0uXG5cdFx0ZGF0dW0gPSBiaXRzID0gY291bnQgPSBmaXJzdCA9IHRvcCA9IHBpID0gYmkgPSAwO1xuXHRcdGZvciAoaSA9IDA7IGkgPCBucGl4OyApIHtcblx0XHRcdGlmICh0b3AgPT09IDApIHtcblx0XHRcdFx0aWYgKGJpdHMgPCBjb2RlX3NpemUpIHtcblx0XHRcdFx0XHRcblx0XHRcdFx0XHQvLyBnZXQgdGhlIG5leHQgYnl0ZVx0XHRcdFxuXHRcdFx0XHRcdGRhdHVtICs9IGRhdGFbYmldIDw8IGJpdHM7XG5cblx0XHRcdFx0XHRiaXRzICs9IDg7XG5cdFx0XHRcdFx0YmkrKztcblx0XHRcdFx0XHRjb3VudC0tO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEdldCB0aGUgbmV4dCBjb2RlLlxuXHRcdFx0XHRjb2RlID0gZGF0dW0gJiBjb2RlX21hc2s7XG5cdFx0XHRcdGRhdHVtID4+PSBjb2RlX3NpemU7XG5cdFx0XHRcdGJpdHMgLT0gY29kZV9zaXplO1xuXHRcdFx0XHQvLyBJbnRlcnByZXQgdGhlIGNvZGVcblx0XHRcdFx0aWYgKChjb2RlID4gYXZhaWxhYmxlKSB8fCAoY29kZSA9PSBlbmRfb2ZfaW5mb3JtYXRpb24pKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvZGUgPT0gY2xlYXIpIHtcblx0XHRcdFx0XHQvLyBSZXNldCBkZWNvZGVyLlxuXHRcdFx0XHRcdGNvZGVfc2l6ZSA9IGRhdGFfc2l6ZSArIDE7XG5cdFx0XHRcdFx0Y29kZV9tYXNrID0gKDEgPDwgY29kZV9zaXplKSAtIDE7XG5cdFx0XHRcdFx0YXZhaWxhYmxlID0gY2xlYXIgKyAyO1xuXHRcdFx0XHRcdG9sZF9jb2RlID0gbnVsbENvZGU7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9sZF9jb2RlID09IG51bGxDb2RlKSB7XG5cdFx0XHRcdFx0cGl4ZWxTdGFja1t0b3ArK10gPSBzdWZmaXhbY29kZV07XG5cdFx0XHRcdFx0b2xkX2NvZGUgPSBjb2RlO1xuXHRcdFx0XHRcdGZpcnN0ID0gY29kZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpbl9jb2RlID0gY29kZTtcblx0XHRcdFx0aWYgKGNvZGUgPT0gYXZhaWxhYmxlKSB7XG5cdFx0XHRcdFx0cGl4ZWxTdGFja1t0b3ArK10gPSBmaXJzdDtcblx0XHRcdFx0XHRjb2RlID0gb2xkX2NvZGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2hpbGUgKGNvZGUgPiBjbGVhcikge1xuXHRcdFx0XHRcdHBpeGVsU3RhY2tbdG9wKytdID0gc3VmZml4W2NvZGVdO1xuXHRcdFx0XHRcdGNvZGUgPSBwcmVmaXhbY29kZV07XG5cdFx0XHRcdH1cblx0XHRcdFx0XG5cdFx0XHRcdGZpcnN0ID0gc3VmZml4W2NvZGVdICYgMHhmZjtcblxuXHRcdFx0XHQvLyBBZGQgYSBuZXcgc3RyaW5nIHRvIHRoZSBzdHJpbmcgdGFibGUsXG5cdFx0XHRcdGlmIChhdmFpbGFibGUgPj0gTUFYX1NUQUNLX1NJWkUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRcblx0XHRcdFx0cGl4ZWxTdGFja1t0b3ArK10gPSBmaXJzdDtcblx0XHRcdFx0cHJlZml4W2F2YWlsYWJsZV0gPSBvbGRfY29kZTtcblx0XHRcdFx0c3VmZml4W2F2YWlsYWJsZV0gPSBmaXJzdDtcblx0XHRcdFx0YXZhaWxhYmxlKys7XG5cdFx0XHRcdGlmICgoKGF2YWlsYWJsZSAmIGNvZGVfbWFzaykgPT09IDApICYmIChhdmFpbGFibGUgPCBNQVhfU1RBQ0tfU0laRSkpIHtcblx0XHRcdFx0XHRjb2RlX3NpemUrKztcblx0XHRcdFx0XHRjb2RlX21hc2sgKz0gYXZhaWxhYmxlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9sZF9jb2RlID0gaW5fY29kZTtcblx0XHRcdH1cblx0XHRcdC8vIFBvcCBhIHBpeGVsIG9mZiB0aGUgcGl4ZWwgc3RhY2suXG5cdFx0XHR0b3AtLTtcblx0XHRcdGRzdFBpeGVsc1twaSsrXSA9IHBpeGVsU3RhY2tbdG9wXTtcblx0XHRcdGkrKztcblx0XHR9XG4gXG5cdFx0Zm9yIChpID0gcGk7IGkgPCBucGl4OyBpKyspIHtcblx0XHRcdGRzdFBpeGVsc1tpXSA9IDA7IC8vIGNsZWFyIG1pc3NpbmcgcGl4ZWxzXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRzdFBpeGVscztcblx0fVxuXG5cdC8vIGRlaW50ZXJsYWNlIGZ1bmN0aW9uIGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3NoYWNoYWYvanNnaWZcblx0ZnVuY3Rpb24gZGVpbnRlcmxhY2UocGl4ZWxzLCB3aWR0aCkge1xuXHRcdFxuXHRcdHZhciBuZXdQaXhlbHMgPSBuZXcgQXJyYXkocGl4ZWxzLmxlbmd0aCk7XG5cdFx0dmFyIHJvd3MgPSBwaXhlbHMubGVuZ3RoIC8gd2lkdGg7XG5cdFx0dmFyIGNwUm93ID0gZnVuY3Rpb24odG9Sb3csIGZyb21Sb3cpIHtcblx0XHRcdHZhciBmcm9tUGl4ZWxzID0gcGl4ZWxzLnNsaWNlKGZyb21Sb3cgKiB3aWR0aCwgKGZyb21Sb3cgKyAxKSAqIHdpZHRoKTtcblx0XHRcdG5ld1BpeGVscy5zcGxpY2UuYXBwbHkobmV3UGl4ZWxzLCBbdG9Sb3cgKiB3aWR0aCwgd2lkdGhdLmNvbmNhdChmcm9tUGl4ZWxzKSk7XG5cdFx0fTtcblxuXHRcdC8vIFNlZSBhcHBlbmRpeCBFLlxuXHRcdHZhciBvZmZzZXRzID0gWzAsNCwyLDFdO1xuXHRcdHZhciBzdGVwcyAgID0gWzgsOCw0LDJdO1xuXG5cdFx0dmFyIGZyb21Sb3cgPSAwO1xuXHRcdGZvciAodmFyIHBhc3MgPSAwOyBwYXNzIDwgNDsgcGFzcysrKSB7XG5cdFx0XHRmb3IgKHZhciB0b1JvdyA9IG9mZnNldHNbcGFzc107IHRvUm93IDwgcm93czsgdG9Sb3cgKz0gc3RlcHNbcGFzc10pIHtcblx0XHRcdFx0Y3BSb3codG9Sb3csIGZyb21Sb3cpO1xuXHRcdFx0XHRmcm9tUm93Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ld1BpeGVscztcblx0fVxufTtcblxuLy8gcmV0dXJucyBhbGwgZnJhbWVzIGRlY29tcHJlc3NlZFxuR0lGLnByb3RvdHlwZS5kZWNvbXByZXNzRnJhbWVzID0gZnVuY3Rpb24oKXtcblx0dmFyIGZyYW1lcyA9IFtdO1xuXHRmb3IodmFyIGk9MDsgaTx0aGlzLnJhdy5mcmFtZXMubGVuZ3RoOyBpKyspe1xuXHRcdHZhciBmcmFtZSA9IHRoaXMucmF3LmZyYW1lc1tpXTtcblx0XHRpZihmcmFtZS5pbWFnZSl7XG5cdFx0XHRmcmFtZXMucHVzaCh0aGlzLmRlY29tcHJlc3NGcmFtZShpKSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmcmFtZXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdJRjsiLCJcbi8vIFNjaGVtYSBmb3IgdGhlIGpzIGZpbGUgcGFyc2VyIHRvIHVzZSB0byBwYXJzZSBnaWYgZmlsZXNcbi8vIEZvciBqcyBvYmplY3QgY29udmVuaWVuY2UgKHJlLXVzZSksIHRoZSBzY2hlbWEgb2JqZWN0cyBhcmUgYXBwcm94aW1hdGVseSByZXZlcnNlIG9yZGVyZWRcblxuLy8gY29tbW9uIHBhcnNlcnMgYXZhaWxhYmxlXG52YXIgUGFyc2VycyA9IHJlcXVpcmUoJy4uL2Jvd2VyX2NvbXBvbmVudHMvanMtYmluYXJ5LXNjaGVtYS1wYXJzZXIvc3JjL3BhcnNlcnMnKTtcblxuLy8gYSBzZXQgb2YgMHgwMCB0ZXJtaW5hdGVkIHN1YmJsb2Nrc1xudmFyIHN1YkJsb2NrcyA9IHtcblx0bGFiZWw6ICdibG9ja3MnLFxuXHRwYXJzZXI6IGZ1bmN0aW9uKHN0cmVhbSl7XG5cdFx0dmFyIG91dCA9IFtdO1xuXHRcdHZhciB0ZXJtaW5hdG9yID0gMHgwMDtcdFx0XG5cdFx0Zm9yKHZhciBzaXplPXN0cmVhbS5yZWFkQnl0ZSgpOyBzaXplIT09dGVybWluYXRvcjsgc2l6ZT1zdHJlYW0ucmVhZEJ5dGUoKSl7XG5cdFx0XHRvdXQgPSBvdXQuY29uY2F0KHN0cmVhbS5yZWFkQnl0ZXMoc2l6ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG59O1xuXG4vLyBnbG9iYWwgY29udHJvbCBleHRlbnNpb25cbnZhciBnY2UgPSB7XG5cdGxhYmVsOiAnZ2NlJyxcblx0cmVxdWlyZXM6IGZ1bmN0aW9uKHN0cmVhbSl7XG5cdFx0Ly8ganVzdCBwZWVrIGF0IHRoZSB0b3AgdHdvIGJ5dGVzLCBhbmQgaWYgdHJ1ZSBkbyB0aGlzXG5cdFx0dmFyIGNvZGVzID0gc3RyZWFtLnBlZWtCeXRlcygyKTtcblx0XHRyZXR1cm4gY29kZXNbMF0gPT09IDB4MjEgJiYgY29kZXNbMV0gPT09IDB4Rjk7XG5cdH0sXG5cdHBhcnRzOiBbXG5cdFx0eyBsYWJlbDogJ2NvZGVzJywgcGFyc2VyOiBQYXJzZXJzLnJlYWRCeXRlcygyKSwgc2tpcDogdHJ1ZSB9LFxuXHRcdHsgbGFiZWw6ICdieXRlU2l6ZScsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZSgpIH0sXG5cdFx0eyBsYWJlbDogJ2V4dHJhcycsIGJpdHM6IHtcblx0XHRcdGZ1dHVyZTogeyBpbmRleDogMCwgbGVuZ3RoOiAzIH0sXG5cdFx0XHRkaXNwb3NhbDogeyBpbmRleDogMywgbGVuZ3RoOiAzIH0sXG5cdFx0XHR1c2VySW5wdXQ6IHsgaW5kZXg6IDYgfSxcblx0XHRcdHRyYW5zcGFyZW50Q29sb3JHaXZlbjogeyBpbmRleDogNyB9XG5cdFx0fX0sXG5cdFx0eyBsYWJlbDogJ2RlbGF5JywgcGFyc2VyOiBQYXJzZXJzLnJlYWRVbnNpZ25lZCh0cnVlKSB9LFxuXHRcdHsgbGFiZWw6ICd0cmFuc3BhcmVudENvbG9ySW5kZXgnLCBwYXJzZXI6IFBhcnNlcnMucmVhZEJ5dGUoKSB9LFxuXHRcdHsgbGFiZWw6ICd0ZXJtaW5hdG9yJywgcGFyc2VyOiBQYXJzZXJzLnJlYWRCeXRlKCksIHNraXA6IHRydWUgfVxuXHRdXG59O1xuXG4vLyBpbWFnZSBwaXBlbGluZSBibG9ja1xudmFyIGltYWdlID0ge1xuXHRsYWJlbDogJ2ltYWdlJyxcblx0cmVxdWlyZXM6IGZ1bmN0aW9uKHN0cmVhbSl7XG5cdFx0Ly8gcGVlayBhdCB0aGUgbmV4dCBieXRlXG5cdFx0dmFyIGNvZGUgPSBzdHJlYW0ucGVla0J5dGUoKTtcblx0XHRyZXR1cm4gY29kZSA9PT0gMHgyQztcblx0fSxcblx0cGFydHM6IFtcblx0XHR7IGxhYmVsOiAnY29kZScsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZSgpLCBza2lwOiB0cnVlIH0sXG5cdFx0e1xuXHRcdFx0bGFiZWw6ICdkZXNjcmlwdG9yJywgLy8gaW1hZ2UgZGVzY3JpcHRvclxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBsYWJlbDogJ2xlZnQnLCBwYXJzZXI6IFBhcnNlcnMucmVhZFVuc2lnbmVkKHRydWUpIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b3AnLCBwYXJzZXI6IFBhcnNlcnMucmVhZFVuc2lnbmVkKHRydWUpIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd3aWR0aCcsIHBhcnNlcjogUGFyc2Vycy5yZWFkVW5zaWduZWQodHJ1ZSkgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2hlaWdodCcsIHBhcnNlcjogUGFyc2Vycy5yZWFkVW5zaWduZWQodHJ1ZSkgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2xjdCcsIGJpdHM6IHtcblx0XHRcdFx0XHRleGlzdHM6IHsgaW5kZXg6IDAgfSxcblx0XHRcdFx0XHRpbnRlcmxhY2VkOiB7IGluZGV4OiAxIH0sXG5cdFx0XHRcdFx0c29ydDogeyBpbmRleDogMiB9LFxuXHRcdFx0XHRcdGZ1dHVyZTogeyBpbmRleDogMywgbGVuZ3RoOiAyIH0sXG5cdFx0XHRcdFx0c2l6ZTogeyBpbmRleDogNSwgbGVuZ3RoOiAzIH1cblx0XHRcdFx0fX1cblx0XHRcdF1cblx0XHR9LHtcblx0XHRcdGxhYmVsOiAnbGN0JywgLy8gb3B0aW9uYWwgbG9jYWwgY29sb3IgdGFibGVcblx0XHRcdHJlcXVpcmVzOiBmdW5jdGlvbihzdHJlYW0sIG9iaiwgcGFyZW50KXtcblx0XHRcdFx0cmV0dXJuIHBhcmVudC5kZXNjcmlwdG9yLmxjdC5leGlzdHM7XG5cdFx0XHR9LFxuXHRcdFx0cGFyc2VyOiBQYXJzZXJzLnJlYWRBcnJheSgzLCBmdW5jdGlvbihzdHJlYW0sIG9iaiwgcGFyZW50KXtcblx0XHRcdFx0cmV0dXJuIE1hdGgucG93KDIsIHBhcmVudC5kZXNjcmlwdG9yLmxjdC5zaXplICsgMSk7XG5cdFx0XHR9KVxuXHRcdH0se1xuXHRcdFx0bGFiZWw6ICdkYXRhJywgLy8gdGhlIGltYWdlIGRhdGEgYmxvY2tzXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGxhYmVsOiAnbWluQ29kZVNpemUnLCBwYXJzZXI6IFBhcnNlcnMucmVhZEJ5dGUoKSB9LFxuXHRcdFx0XHRzdWJCbG9ja3Ncblx0XHRcdF1cblx0XHR9XG5cdF1cbn07XG5cbi8vIHBsYWluIHRleHQgYmxvY2tcbnZhciB0ZXh0ID0ge1xuXHRsYWJlbDogJ3RleHQnLFxuXHRyZXF1aXJlczogZnVuY3Rpb24oc3RyZWFtKXtcblx0XHQvLyBqdXN0IHBlZWsgYXQgdGhlIHRvcCB0d28gYnl0ZXMsIGFuZCBpZiB0cnVlIGRvIHRoaXNcblx0XHR2YXIgY29kZXMgPSBzdHJlYW0ucGVla0J5dGVzKDIpO1xuXHRcdHJldHVybiBjb2Rlc1swXSA9PT0gMHgyMSAmJiBjb2Rlc1sxXSA9PT0gMHgwMTtcblx0fSxcblx0cGFydHM6IFtcblx0XHR7IGxhYmVsOiAnY29kZXMnLCBwYXJzZXI6IFBhcnNlcnMucmVhZEJ5dGVzKDIpLCBza2lwOiB0cnVlIH0sXG5cdFx0eyBsYWJlbDogJ2Jsb2NrU2l6ZScsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZSgpIH0sXG5cdFx0eyBcblx0XHRcdGxhYmVsOiAncHJlRGF0YScsIFxuXHRcdFx0cGFyc2VyOiBmdW5jdGlvbihzdHJlYW0sIG9iaiwgcGFyZW50KXtcblx0XHRcdFx0cmV0dXJuIHN0cmVhbS5yZWFkQnl0ZXMocGFyZW50LnRleHQuYmxvY2tTaXplKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHN1YkJsb2Nrc1xuXHRdXG59O1xuXG4vLyBhcHBsaWNhdGlvbiBibG9ja1xudmFyIGFwcGxpY2F0aW9uID0ge1xuXHRsYWJlbDogJ2FwcGxpY2F0aW9uJyxcblx0cmVxdWlyZXM6IGZ1bmN0aW9uKHN0cmVhbSwgb2JqLCBwYXJlbnQpe1xuXHRcdC8vIG1ha2Ugc3VyZSB0aGlzIGZyYW1lIGRvZXNuJ3QgYWxyZWFkeSBoYXZlIGEgZ2NlLCB0ZXh0LCBjb21tZW50LCBvciBpbWFnZVxuXHRcdC8vIGFzIHRoYXQgbWVhbnMgdGhpcyBibG9jayBzaG91bGQgYmUgYXR0YWNoZWQgdG8gdGhlIG5leHQgZnJhbWVcblx0XHQvL2lmKHBhcmVudC5nY2UgfHwgcGFyZW50LnRleHQgfHwgcGFyZW50LmltYWdlIHx8IHBhcmVudC5jb21tZW50KXsgcmV0dXJuIGZhbHNlOyB9XG5cblx0XHQvLyBwZWVrIGF0IHRoZSB0b3AgdHdvIGJ5dGVzXG5cdFx0dmFyIGNvZGVzID0gc3RyZWFtLnBlZWtCeXRlcygyKTtcblx0XHRyZXR1cm4gY29kZXNbMF0gPT09IDB4MjEgJiYgY29kZXNbMV0gPT09IDB4RkY7XG5cdH0sXG5cdHBhcnRzOiBbXG5cdFx0eyBsYWJlbDogJ2NvZGVzJywgcGFyc2VyOiBQYXJzZXJzLnJlYWRCeXRlcygyKSwgc2tpcDogdHJ1ZSB9LFxuXHRcdHsgbGFiZWw6ICdibG9ja1NpemUnLCBwYXJzZXI6IFBhcnNlcnMucmVhZEJ5dGUoKSB9LFxuXHRcdHsgXG5cdFx0XHRsYWJlbDogJ2lkJywgXG5cdFx0XHRwYXJzZXI6IGZ1bmN0aW9uKHN0cmVhbSwgb2JqLCBwYXJlbnQpe1xuXHRcdFx0XHRyZXR1cm4gc3RyZWFtLnJlYWRTdHJpbmcocGFyZW50LmJsb2NrU2l6ZSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRzdWJCbG9ja3Ncblx0XVxufTtcblxuLy8gY29tbWVudCBibG9ja1xudmFyIGNvbW1lbnQgPSB7XG5cdGxhYmVsOiAnY29tbWVudCcsXG5cdHJlcXVpcmVzOiBmdW5jdGlvbihzdHJlYW0sIG9iaiwgcGFyZW50KXtcblx0XHQvLyBtYWtlIHN1cmUgdGhpcyBmcmFtZSBkb2Vzbid0IGFscmVhZHkgaGF2ZSBhIGdjZSwgdGV4dCwgY29tbWVudCwgb3IgaW1hZ2Vcblx0XHQvLyBhcyB0aGF0IG1lYW5zIHRoaXMgYmxvY2sgc2hvdWxkIGJlIGF0dGFjaGVkIHRvIHRoZSBuZXh0IGZyYW1lXG5cdFx0Ly9pZihwYXJlbnQuZ2NlIHx8IHBhcmVudC50ZXh0IHx8IHBhcmVudC5pbWFnZSB8fCBwYXJlbnQuY29tbWVudCl7IHJldHVybiBmYWxzZTsgfVxuXG5cdFx0Ly8gcGVlayBhdCB0aGUgdG9wIHR3byBieXRlc1xuXHRcdHZhciBjb2RlcyA9IHN0cmVhbS5wZWVrQnl0ZXMoMik7XG5cdFx0cmV0dXJuIGNvZGVzWzBdID09PSAweDIxICYmIGNvZGVzWzFdID09PSAweEZFO1xuXHR9LFxuXHRwYXJ0czogW1xuXHRcdHsgbGFiZWw6ICdjb2RlcycsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZXMoMiksIHNraXA6IHRydWUgfSxcblx0XHRzdWJCbG9ja3Ncblx0XVxufTtcblxuLy8gZnJhbWVzIG9mIGV4dCBhbmQgaW1hZ2UgZGF0YVxudmFyIGZyYW1lcyA9IHtcblx0bGFiZWw6ICdmcmFtZXMnLFxuXHRwYXJ0czogW1xuXHRcdGdjZSxcblx0XHRhcHBsaWNhdGlvbixcblx0XHRjb21tZW50LFxuXHRcdGltYWdlLFxuXHRcdHRleHRcblx0XSxcblx0bG9vcDogZnVuY3Rpb24oc3RyZWFtKXtcblx0XHR2YXIgbmV4dENvZGUgPSBzdHJlYW0ucGVla0J5dGUoKTtcblx0XHQvLyByYXRoZXIgdGhhbiBjaGVjayBmb3IgYSB0ZXJtaW5hdG9yLCB3ZSBzaG91bGQgY2hlY2sgZm9yIHRoZSBleGlzdGVuY2Vcblx0XHQvLyBvZiBhbiBleHQgb3IgaW1hZ2UgYmxvY2sgdG8gYXZvaWQgaW5maW5pdGUgbG9vcHNcblx0XHQvL3ZhciB0ZXJtaW5hdG9yID0gMHgzQjtcblx0XHQvL3JldHVybiBuZXh0Q29kZSAhPT0gdGVybWluYXRvcjtcblx0XHRyZXR1cm4gbmV4dENvZGUgPT09IDB4MjEgfHwgbmV4dENvZGUgPT09IDB4MkM7XG5cdH1cbn07XG5cbi8vIG1haW4gR0lGIHNjaGVtYVxudmFyIHNjaGVtYUdJRiA9IFtcblx0e1xuXHRcdGxhYmVsOiAnaGVhZGVyJywgLy8gZ2lmIGhlYWRlclxuXHRcdHBhcnRzOiBbXG5cdFx0XHR7IGxhYmVsOiAnc2lnbmF0dXJlJywgcGFyc2VyOiBQYXJzZXJzLnJlYWRTdHJpbmcoMykgfSxcblx0XHRcdHsgbGFiZWw6ICd2ZXJzaW9uJywgcGFyc2VyOiBQYXJzZXJzLnJlYWRTdHJpbmcoMykgfVxuXHRcdF1cblx0fSx7XG5cdFx0bGFiZWw6ICdsc2QnLCAvLyBsb2NhbCBzY3JlZW4gZGVzY3JpcHRvclxuXHRcdHBhcnRzOiBbXG5cdFx0XHR7IGxhYmVsOiAnd2lkdGgnLCBwYXJzZXI6IFBhcnNlcnMucmVhZFVuc2lnbmVkKHRydWUpIH0sXG5cdFx0XHR7IGxhYmVsOiAnaGVpZ2h0JywgcGFyc2VyOiBQYXJzZXJzLnJlYWRVbnNpZ25lZCh0cnVlKSB9LFxuXHRcdFx0eyBsYWJlbDogJ2djdCcsIGJpdHM6IHtcblx0XHRcdFx0ZXhpc3RzOiB7IGluZGV4OiAwIH0sXG5cdFx0XHRcdHJlc29sdXRpb246IHsgaW5kZXg6IDEsIGxlbmd0aDogMyB9LFxuXHRcdFx0XHRzb3J0OiB7IGluZGV4OiA0IH0sXG5cdFx0XHRcdHNpemU6IHsgaW5kZXg6IDUsIGxlbmd0aDogMyB9XG5cdFx0XHR9fSxcblx0XHRcdHsgbGFiZWw6ICdiYWNrZ3JvdW5kQ29sb3JJbmRleCcsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZSgpIH0sXG5cdFx0XHR7IGxhYmVsOiAncGl4ZWxBc3BlY3RSYXRpbycsIHBhcnNlcjogUGFyc2Vycy5yZWFkQnl0ZSgpIH1cblx0XHRdXG5cdH0se1xuXHRcdGxhYmVsOiAnZ2N0JywgLy8gZ2xvYmFsIGNvbG9yIHRhYmxlXG5cdFx0cmVxdWlyZXM6IGZ1bmN0aW9uKHN0cmVhbSwgb2JqKXtcblx0XHRcdHJldHVybiBvYmoubHNkLmdjdC5leGlzdHM7XG5cdFx0fSxcblx0XHRwYXJzZXI6IFBhcnNlcnMucmVhZEFycmF5KDMsIGZ1bmN0aW9uKHN0cmVhbSwgb2JqKXtcblx0XHRcdHJldHVybiBNYXRoLnBvdygyLCBvYmoubHNkLmdjdC5zaXplICsgMSk7XG5cdFx0fSlcblx0fSxcblx0ZnJhbWVzIC8vIGNvbnRlbnQgZnJhbWVzXG5dO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNjaGVtYUdJRjsiXX0=
