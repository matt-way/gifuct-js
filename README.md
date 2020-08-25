# gifuct-js

A Simple to use javascript .GIF decoder.

We needed to be able to efficiently load and manipulate GIF files for the **[Ruffle][1]** hybrid app (for mobiles). There are a couple of example libraries out there like [jsgif][2] & its derivative [libgif-js][3], however these are admittedly inefficient, and a mess. After pulling our hair out trying to understand the ancient, mystic gif format (hence the project name), we decided to just roll our own. This library also removes any specific drawing code, and simply parses, and decompresses gif files so that you can manipulate and display them however you like. We do include `imageData` patch construction though to get you most of the way there.

### Demo

You can see a demo of this library in action **[here][4]**

### Usage

_Installation:_

    npm install gifuct-js

_Decoding:_

This decoder uses **[js-binary-schema-parser][5]** to parse the gif files (you can examine the schema in the source). This means the gif file must firstly be converted into a `Uint8Array` buffer in order to decode it. Some examples:

- _fetch_

        import { parseGIF, decompressFrames } from 'gifuct-js'

        var promisedGif = fetch(gifURL)
             .then(resp => resp.arrayBuffer())
             .then(buff => parseGIF(buff))
             .then(gif => decompressFrames(gif, true));

- _XMLHttpRequest_

        import { parseGIF, decompressFrames } from 'gifuct-js'

        var oReq = new XMLHttpRequest();
        oReq.open("GET", gifURL, true);
        oReq.responseType = "arraybuffer";

        oReq.onload = function (oEvent) {
            var arrayBuffer = oReq.response; // Note: not oReq.responseText
            if (arrayBuffer) {
                var gif = parseGIF(arrayBuffer);
                var frames = decompressFrames(gif, true);
                // do something with the frame data
            }
        };

        oReq.send(null);

_Result:_

The result of the `decompressFrames(gif, buildPatch)` function returns an array of all the GIF image frames, and their meta data. Here is a an example frame:

    {
        // The color table lookup index for each pixel
        pixels: [...],
        // the dimensions of the gif frame (see disposal method)
        dims: {
            top: 0,
            left: 10,
            width: 100,
            height: 50
        },
        // the time in milliseconds that this frame should be shown
        delay: 50,
        // the disposal method (see below)
        disposalType: 1,
        // an array of colors that the pixel data points to
        colorTable: [...],
        // An optional color index that represents transparency (see below)
        transparentIndex: 33,
        // Uint8ClampedArray color converted patch information for drawing
        patch: [...]
     }

_Automatic Patch Generation:_

If the `buildPatch` param of the `dcompressFrames()` function is `true`, the parser will not only return the parsed and decompressed gif frames, but will also create canvas ready `Uint8ClampedArray` arrays of each gif frame image, so that they can easily be drawn using `ctx.putImageData()` for example. This requirement is common, however it was made optional because it makes assumptions about transparency. The [demo][4] makes use of this option.

_Disposal Method:_

The `pixel` data is stored as a list of indexes for each pixel. These each point to a value in the `colorTable` array, which contain the color that each pixel should be drawn. Each frame of the gif may not be the full size, but instead a patch that needs to be drawn over a particular location. The `disposalType` defines how that patch should be drawn over the gif canvas. In most cases, that value will be `1`, indicating that the gif frame should be simply drawn over the existing gif canvas without altering any pixels outside the frames patch dimensions. More can be read about this [here][6].

_Transparency:_

If a `transparentIndex` is defined for a frame, it means that any pixel within the pixel data that matches this index should not be drawn. When drawing the patch using canvas, this means setting the alpha value for this pixel to `0`.

### Drawing the GIF

Check out the **[demo][4]** for an example of how to draw/manipulate a gif using this library. We wanted the library to be drawing agnostic to allow users to do what they wish with the raw gif data, rather than impose a method that has to be altered. On this note however, we provide an easy interface for creating commonly used canvas pixel data for drawing ease.

### Thanks to

We underestimated the convolutedness of the GIF format, so this library couldn't have been made without the help of:

- [Project: What's In A GIF - Bit by Byte][7] - An amazingly detailed blog by Matthew Flickinger
- [jsgif][2]
- The [*almost correct*] LZW decompression from [this neat gist][8]

### Who are we?

[Matt Way][9] & [Nick Drewe][10]

[Wethrift.com][11]

[1]: https://www.producthunt.com/posts/ruffle
[2]: http://slbkbs.org/jsgif/
[3]: https://github.com/buzzfeed/libgif-js
[4]: http://matt-way.github.io/gifuct-js/
[5]: https://github.com/matt-way/jsBinarySchemaParser
[6]: http://www.matthewflickinger.com/lab/whatsinagif/animation_and_transparency.asp
[7]: http://www.matthewflickinger.com/lab/whatsinagif/index.html
[8]: https://gist.github.com/devunwired/4479231
[9]: https://twitter.com/_MattWay
[10]: https://twitter.com/nickdrewe
[11]: https://wethrift.com
