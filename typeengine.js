
//  for (var i = 0; i < text.length; i++) {
//      let glyph = font.charToGlyph(text.charAt(i));
//      console.log(glyph);
//      console.log(glyph);
//      console.log(glyph.getBoundingBox());
//      let a, b, c, d =glyph.getBoundingBox();
//      ctx.beginPath();
//      ctx.rect(a, b, c, d);
//      ctx.stroke();
//      break;
//  }



function typeset(text, font, options) {

    function wordsToNodes(words) {
        var nodes = [];
        var linebreak = TypeEngine.linebreak;
        words.forEach(function (word, index, array) {
            var hyphenated = hyphenate(word).split(String.fromCodePoint(0x00AD));

            if (hyphenated.length > 1) {
                hyphenated.forEach(function (part, partIndex, partArray) {
                    nodes.push(linebreak.box(measureString(part), part));
                    if (partIndex !== partArray.length - 1) {
                        nodes.push(linebreak.penalty(hyphenWidth, hyphenPenalty, 1));
                    }
                });
            } else {
                nodes.push(linebreak.box(measureString(word), word));
            }

            if (index === array.length - 1) {
                nodes.push(linebreak.glue(0, linebreak.infinity, 0));
                nodes.push(linebreak.penalty(0, -linebreak.infinity, 1));
            } else {
                nodes.push(linebreak.glue(space.width, space.stretch, space.shrink));
            }
        });
        return nodes;
    }
    function formatterText(nodes, breaks, linewidths) {
        let text = "";
        for (let i=1; i < breaks.length; i++) {
            let startIdx = breaks[i-1].position;
            let endIdx = breaks[i].position;
            console.log(startIdx, endIdx);
            let line = "";
            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                if (node.type == 'box') {
                    line += node.value;
                } else if (node.type == 'glue') {
                    line += " ";
                } else if (node.type == 'penalty' && j < endIdx) {
                    line += '';
                } else if (node.type == 'penalty' && j == endIdx) {
                    line += '-';
                }
            }
            text += line + "\n";
        }
        return text;
    }
    function getOverhangRight(chr) {
        // see http://www.pragma-ade.com/pdftex/thesis.pdf page 43
        if ("*',.-\";:".includes(chr)) {
            return 700;
        }
        if ("–".includes(chr)) {
            return 300;
        }
        if ("–".includes(chr)) {
            return 200;
        }
        if (")AFKLTVWXYkrtvwxy".includes(chr)) {
            return 50;
        }
        return 0;
    }
    function formatterHTML(nodes, breaks, linewidths) {
        let html = "";

        let overhangFactor = 1200 / 1000;
        let overhangMargin = measureString(hypenChar) / 2 * overhangFactor;

        for (let i=1; i < breaks.length; i++) {
            let startIdx = breaks[i-1].position;
            let endIdx = breaks[i].position;
            let boxWidth = 0.;
            let glueWidth = 0.;
            let nGlues = 0;
            let linewidth = linewidths[0];
            if (linewidths.lengths > 1) {
                linewidth =  linewidths[i - 1];
            }

            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                if (node.type == 'box') {
                    boxWidth += node.width;
                } else if (node.type == 'glue' && j != startIdx && j != endIdx) {
                    glueWidth += node.width;
                    nGlues += 1;
                } else if (node.type == 'penalty' && j == endIdx) {
                    boxWidth += node.width;
                }
            }
            let overhangFactor = 1200 / 1000;
            let baseOverhang = measureString(hypenChar) / 2 * overhangFactor;
            let overhangMargin = baseOverhang;
            var overhang = 0;

            let lastNode = nodes[endIdx];
            if (lastNode.type == 'glue') {
                lastNode = nodes[endIdx - 1];
            }
            if (lastNode.type == 'box') {
                let val = lastNode.value;
                let chr = val.charAt(val.length-1);
                let baseOverhang = measureString(hypenChar) * overhangFactor;
                overhang = getOverhangRight(chr) / 1000;
            } else if (lastNode.type == 'penalty') {
                overhang = getOverhangRight(hypenChar) / 1000;
            }

            overhang = baseOverhang * overhang;

            let isLastLine = i + 1 === breaks.length;
            if (isLastLine) {
                linewidth = Math.min(boxWidth + glueWidth, linewidth);
            }

            linewidthWOverhang = linewidth - 5 - overhangMargin + overhang

            let perfectStretch = (linewidthWOverhang - nGlues * space.width) / boxWidth

            var stretch = Math.max(options.minStretch, Math.min(perfectStretch, options.maxStretch));
            stretch = Math.round(stretch * 100);
            let spaceWidth = (linewidthWOverhang - boxWidth * stretch / 100) / nGlues;
            let line = "";

            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                if (node.type == 'box') {
                    line += `<span style="width: ${node.width}px; font-stretch:${stretch}%">${node.value}</span>`;
                } else if (node.type == 'glue' && j != startIdx && j != endIdx) {
                    line += `<span style="width: ${spaceWidth}px; display: inline-block">&nbsp;</span>`;
                } else if (node.type == 'glue' && j == endIdx) {
                    line += `<span style="width: 0px; display: inline-block">&nbsp;</span>`;
                } else if (node.type == 'penalty' && j == endIdx && ! isLastLine) {
                    line += `<span >${hypenChar}</span>`;
                }
            }
            line += "";
            html += line + "";
        }
        return html;
    }
    let fontSize = options.fontSize;
    let textWidth = options.textWidth;
    let hypenChar = '-';
    let shy = String.fromCharCode(0x00AD)
    let words = text.split(' ');
    let syllable_widths = [];

    measureString = (x) => font.getAdvanceWidth(x, fontSize);

    var space = {
        width: 0,
        stretch: 0,
        shrink: 0
    };
    let hyphenWidth = measureString('-');
    let hyphenPenalty = 100;

    space.width = measureString(' ');
    space.stretch = (space.width * 3) / 6;
    space.shrink = (space.width * 2) / 6;

    nodes = wordsToNodes(words, space, measureString, hyphenate);
    let breaks = [];

    for (let tolerance = 0; breaks.length === 0 && tolerance <= 10; tolerance++) {
        breaks = TypeEngine.linebreak(nodes, [textWidth], {'tolerance': tolerance});
    }

    let formattedText = formatterText(nodes, breaks, [textWidth]);
    let html = formatterHTML(nodes, breaks, [textWidth]);
    console.log(nodes)
    console.log(breaks)
    console.log(formattedText)
    console.log(html)
    return html;
    //breaks = linebreak(nodes, lineLengths.length !== 0 ? lineLengths : [lineLength], {tolerance: 1});
    //         for (let syllable of word.split(shy)) {
    //             if (syllable == "") {
    //             }
    //             console.log(syllable, fontSize, );
    //
    //     }
}

hyphenate = window.createHyphenator(hyphenationPatternsDe1996);
console.log(hyphenate)

window.addEventListener("load", function(event) {
    let container = document.getElementById("js_typeset");
    console.log(container);
    let ps = container.querySelectorAll("p");
    console.log(ps[0])
    console.log(ps[0].textContent)

    // let fontUrl = "Amstelvar-Roman-VF.ttf";
    let fontUrl = "Inconsolata-VF.ttf";
    // let fontUrl = "SourceSerifVariable-Roman.ttf";
    opentype.load(fontUrl, function(err, font) {
        if (err) {
            alert('Font could not be loaded: ' + err);
        } else {
            // Now let's display it on a canvas with id "canvas"
            var ctx = document.getElementById('canvas').getContext('2d');

            // Construct a Path object containing the letter shapes of the given text.
            // The other parameters are x, y and fontSize.
            // Note that y is the position of the baseline.
            //var path = font.getPath('Hello, World!', 0, 150, 18);

            // If you just want to draw the text you can also use font.draw(ctx, text, x, y, fontSize).
            // path.draw(ctx);
            for (let p of container.querySelectorAll("p")) {
                let text = p.textContent;
                var style = window.getComputedStyle(p, null).getPropertyValue('font-size');
                var fontSize = parseFloat(style);
                p.innerHTML = typeset(text, font, {
                    'fontSize': fontSize,
                    'textWidth': 400,
                    'minStretch': 0.98,
                    'maxStretch': 1.02
                });
            }
        }
    });
});

