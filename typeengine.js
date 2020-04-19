
function typeset(containerElem, options) {
    function createSpan(part) {
        let elem = document.createElement('span');
        elem.innerHTML = part;
        return elem;
    }
    function spanifyPart(part, parentNode) {
        let elem = createSpan(part);
        parentNode.appendChild(elem);
        let rect = elem.getBoundingClientRect();
        let width = rect.width;
        return [width, elem];
    };
    function spanifyWords(words, parentNode, hyphenWidth) {
        let isFontStretchable = () => true;
        let nodes = [];

        words.filter(word => word !== "").forEach(function (word, index, array) {
            var hyphenated = hyphenate(word).split(hyphenShy);
            if (hyphenated.length > 1) {
                hyphenated.forEach(function (part, partIndex, partArray) {
                    if (partIndex !== partArray.length - 1) {
                        let [width, elem] = spanifyPart(part, parentNode);
                        nodes.push(linebreak.box(width, part, elem, isFontStretchable()));
                        nodes.push(linebreak.penalty(hyphenWidth, hyphenPenalty, 1, null));
                    } else {
                        let [width, elem] = spanifyPart(part, parentNode);
                        nodes.push(linebreak.box(width, part, elem, isFontStretchable()));
                    }
                });
            } else {
                let [width, elem] = spanifyPart(word, parentNode);
                nodes.push(linebreak.box(width, word, elem, isFontStretchable()));
            }
            if (index === array.length - 1) {

            } else {
                let [spacewidth, elem] = spanifyPart('&nbsp;', parentNode);
                nodes.push(linebreak.glue(space.width, space.stretch, space.shrink, elem));
            }
        });
        return nodes;
    }
    function measureString(text, node) {
        let elem = document.createElement('span');
        elem.textContent = text;
        node.appendChild(elem);
        elem.getBoundingClientRect();
        let width = elem.getBoundingClientRect().width;
        node.removeChild(elem);
        return width
    }
    function spanifyParagraph(node) {
        let inlineNodes = spanify(node);
        let [spacewidth, elem] = spanifyPart('&nbsp;', );
        inlineNodes.push(linebreak.glue(0, linebreak.infinity, 0, elem));
        inlineNodes.push(linebreak.penalty(0, -linebreak.infinity, 1));
        return inlineNodes;
    }
    function spanify(node) {
        let inlineNodes = [];
        let childrens = node.childNodes;

        let orphanGlue = document.createElement('span');


        for (let child of childrens) {
            if (child.nodeType == Node.TEXT_NODE) {
                let hyphenWidth = measureString("-", node);
                const text = child.textContent;
                if (/^\s*$/.test(text)) {
                    continue;
                }
                let spancontainer = document.createElement('span');
                spancontainer.setAttribute('style', 'hyphens: none');
                node.replaceChild(spancontainer, child);

                if (text[0] === " ") {
                    let [spacewidth, elem] = spanifyPart('&nbsp;', spancontainer);
                    inlineNodes.push(linebreak.glue(space.width, space.stretch, space.shrink, elem));
                }
                let words = text.split(' ');
                for (let n of spanifyWords(words, spancontainer, hyphenWidth)) {
                    inlineNodes.push(n);
                }
                if (text[text.length - 1] === " ") {
                    let [spacewidth, elem] = spanifyPart('&nbsp;', spancontainer);
                    inlineNodes.push(linebreak.glue(space.width, space.stretch, space.shrink, elem));
                }
                spancontainer.setAttribute('style', 'hyphens: manual');
            } else if (child.nodeType == Node.ELEMENT_NODE) {
                console.log(child, child.tagName)

                if (child.tagName == 'SPAN') {
                    let style = window.getComputedStyle(child);
                    let display = style.getPropertyValue('display');
                    console.log(display, child)
                    if (child.classList.contains('katex-mathml')) {
                        continue
                    }
                    if (display === 'inline') {
                         Array.prototype.push.apply(inlineNodes, spanify(child))
                    } else {
                        let rect = child.getBoundingClientRect();
                        inlineNodes.push(linebreak.glue(0, 0, 0, orphanGlue));
                        inlineNodes.push(linebreak.box(rect.width, "", child, false));
                        inlineNodes.push(linebreak.glue(0, 0, 0, orphanGlue));
                    }
                } else {
                     Array.prototype.push.apply(inlineNodes, spanify(child))
                }
            }
        }
        return inlineNodes;
    }

    function wordsToNodes(words) {
        var nodes = [];
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
    function getOverhang(chr) {
        if (chr in fontCfg.protrusion) {
            return fontCfg.protrusion[chr];
        } else {
            // TODO: alias ascii
        }
        return [0, 0];
    }
    function getOverhangLeft(chr) {
        return getOverhang(chr)[0];
    }
    function getOverhangRight(chr) {
        return getOverhang(chr)[1];
    }
    function formatterHTML(nodes, breaks, linewidths) {
        let overhangFactor = 1200 / 1000;
        let overhangMargin = measureString(hyphenChar, nodes[0].elem) * overhangFactor;

        for (let breakIdx=1; breakIdx < breaks.length; breakIdx++) {
            let isLastLine = breakIdx + 1 === breaks.length;
            let startIdx = breaks[breakIdx-1].position;
            let endIdx = breaks[breakIdx].position;
            let boxWidth = .0;
            let stretchableBoxWidth = .0;
            let glueWidth = 0.;
            let nGlues = 0;
            let borderWidth = 0;
            //let borderWidth = 0;
            let nBoxes = 0;
            let linewidth = linewidths[0];
            if (linewidths.lengths > 1) {
                linewidth =  linewidths[breakIdx - 1];
            }

            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                if (node.type == 'box') {
                    boxWidth += node.width;
                    if (node.stretchable) {
                        stretchableBoxWidth += node.width;
                    }
                    nBoxes += 1;
                } else if (node.type == 'glue' && j != startIdx && j != endIdx) {
                    if (node.width != 0) {
                        glueWidth += space.width;
                        nGlues += 1;
                    }
                } else if (node.type == 'penalty' && j == endIdx && ! isLastLine) {
                    boxWidth += node.width;
                    let hyphenElem = createSpan('-');
                    nodes[j - 1].elem.after(hyphenElem);
                    hyphenElem.setAttribute('class', 'typeeninge-hypen');
                    node.elem = hyphenElem;
                    if (node.stretchable) {
                        stretchableBoxWidth += node.width;
                    }
                }
            }

            // overhang left
            let firstNodeIdx = startIdx;
            let firstNode = nodes[startIdx];
            if (firstNode.type !== 'box') {
                firstNodeIdx = startIdx + 1;
                firstNode = nodes[firstNodeIdx];
            }
            let overhangLeft = 0;
            if (firstNode.type === 'box') {
                let chr = firstNode.value.charAt(0);
                let baseOverhang = measureString(chr, firstNode.elem) * overhangFactor;
                overhangLeft = baseOverhang * getOverhangLeft(chr) / 1000;
            }

            // overhang right
            let overhangRight = 0;
            let lastNode = nodes[endIdx];
            let lastIndex = endIdx;
            if (lastNode.type == 'glue') {
                lastNode = nodes[endIdx - 1];
                let lastIndex = endIdx - 1;
            }
            if (lastNode.type == 'box') {
                let val = lastNode.value;
                let chr = val.charAt(val.length-1);
                let baseOverhang = measureString(chr, lastNode.elem) * overhangFactor;
                overhangRight = baseOverhang * getOverhangRight(chr) / 1000;
            } else if (lastNode.type == 'penalty') {
                let node = nodes[lastIndex - 1];
                let hyphenWidth = measureString(hyphenChar, node.elem);
                let baseOverhang = hyphenWidth * overhangFactor;
                overhangRight = baseOverhang * getOverhangRight(hyphenChar) / 1000;
            }


            if (isLastLine) {
                linewidth = Math.min(boxWidth + glueWidth, linewidth);
            }
            if (! useProtrusion) {
                overhangLeft = 0;
                overhangRight = 0;
            }
            let overhang = overhangLeft + overhangRight;
            linewidthWOverhang = linewidth - overhangMargin + overhang + 2*borderWidth*nBoxes;
            //linewidthWOverhang = linewidth; // - overhangMargin + overhang + 2*borderWidth*nBoxes;
            let unusedOverhang = linewidth - linewidthWOverhang;
            let nonStretchableBox = boxWidth - stretchableBoxWidth;
            let perfectStretch = (linewidthWOverhang - nGlues * space.width - nonStretchableBox) / stretchableBoxWidth;

            var stretch = Math.max(options.minStretch, Math.min(perfectStretch, options.maxStretch));
            // stretch = perfectStretch;
            let stretchPerc = stretch * 100;
            let boxWidthStretched = stretchableBoxWidth * stretch;
            let extraBoxWidth = 0.001;
            let extraBoxWidthTotal = 0.001 * boxWidth;
            let totalWhiteSpace = (linewidthWOverhang - boxWidthStretched - nonStretchableBox
                                   - extraBoxWidthTotal
                                   - 2*borderWidth*nBoxes);
            let resolution = 1000000;
            let adaptedSpaceWidth = Math.round(resolution * totalWhiteSpace / nGlues) / resolution;
            // console.log({
            //     breakIdx: breakIdx,
            //     overhang: overhang,
            //     overhangRight: overhangRight,
            //     perfectStretch: perfectStretch,
            //     nonStretchableBox: nonStretchableBox,
            //     glueWidth: glueWidth,
            //     glueWidthPerGlue: glueWidth / nGlues,
            //     adaptedSpaceWidth: adaptedSpaceWidth,
            //     totalWhiteSpace: totalWhiteSpace,
            //     boxWidth: boxWidth,
            //     boxWidthStretched: boxWidthStretched,
            //     linewidthWOverhang: linewidthWOverhang,
            //     unusedOverhang: unusedOverhang,
            //     check: linewidthWOverhang + unusedOverhang,
            //     check2: nGlues * adaptedSpaceWidth + boxWidthStretched
            // });
            // return;
            unusedOverhang = Math.max(0, unusedOverhang - 2);
            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                // console.log(node);
                if (node.type == 'box') {
                    // margin-left: -1px; margin-right: -1px;
                    let style = "display: inline-block;";
                    if (node.stretchable) {
                        let nodeWidth = node.width*stretch * (extraBoxWidth + 1);
                        style += `width: ${nodeWidth}px; font-stretch:${stretchPerc}%;`;
                    }
                    if (j == firstNodeIdx) {
                        style += `margin-left: -${overhangLeft}px;`;
                    }
                    if (borderWidth !== 0) {
                        style += `display: inline-block; border: ${borderWidth}px solid red;  box-sizing: border-box;`;
                    }
                    node.elem.setAttribute('style', style)
                } else if (node.type == 'glue' && j != startIdx && j != endIdx) {
                    node.elem.setAttribute('style', `width: ${adaptedSpaceWidth}px; display: inline-block;`);
                } else if (node.type == 'glue' && j == endIdx) {
                    node.elem.setAttribute('style', `width: ${unusedOverhang}px; display: inline-block`);
                    // node.elem.parentElement.removeChild(node.elem);
                    //node.elem.setAttribute('style', `width: 0px; display: inline`);
                } else if (node.type == 'penalty' && j == endIdx && ! isLastLine) {
                    node.elem.setAttribute('style', 'display: inline');
                }
            }
        }
    }
    let linebreak = TypeEngine.linebreak;

    let containerStyle = window.getComputedStyle(containerElem)
    let textWidth = parseFloat(containerStyle.getPropertyValue('width'));
    let fontSize = parseFloat(window.getComputedStyle(containerElem)
                              .getPropertyValue('font-size'));
    let fontCfg = options.fontConfig;
    let useProtrusion = options.useProtrusion || true;
    let hyphenChar = '-';
    let hyphenShy = String.fromCodePoint(0x00AD);

    let hyphenPenalty = 100;

    var space = {
        width: fontSize / 4.0,
        stretch: 0,
        shrink: 0
    };

    space.stretch = space.width * 6. / 6.;
    space.shrink = space.width * 2. / 6.;

    var t0 = performance.now();

    let inlineNodes = spanify(containerElem);
    let [spacewidth, elem] = spanifyPart('&nbsp;', containerElem);
    inlineNodes.push(linebreak.glue(0, linebreak.infinity, 0, elem));
    inlineNodes.push(linebreak.penalty(0, -linebreak.infinity, 1));

    var t1 = performance.now();
    console.log("Adding span took " + (t1 - t0) + " milliseconds.");


    console.log(inlineNodes);
    // nodes = wordsToNodes(words, space, measureString, hyphenate);
    let breaks = [];

    var t0 = performance.now();
    for (let tolerance = 0; breaks.length === 0 && tolerance <= 10; tolerance++) {
        breaks = TypeEngine.linebreak(inlineNodes, [textWidth], {'tolerance': tolerance});
    }
    var t1 = performance.now();
    console.log("Line Breaking took " + (t1 - t0) + " milliseconds.");

    console.log('breaks', breaks);
    //let formattedText = formatterText(inlineNodes, breaks, [textWidth]);
    formatterHTML(inlineNodes, breaks, [textWidth - 2]);
}

// hyphenate = window.createHyphenator(hyphenationPatternsDe1996);
hyphenate = window.createHyphenator(hyphenationPatternsEnUs);

let fontProtrusionDataUrl = 'typeengine-fonts/font-protrusion.json';

let fontData = null;

function selectFontConfig(fontConfigs, name, shape) {
    for (let cfg of fontConfigs) {
        console.log(cfg.font);
        if (cfg.font === name && cfg.shape == shape) {
            return cfg;
        }
    }
}

let windowLoaded = new Promise((done, fail) => {
    window.addEventListener("load", function(event) {
        done();
    });
})

let fontConfigsFetched = fetch(fontProtrusionDataUrl)
  .then((response) => {
      return response.json();
    })

Promise.all([fontConfigsFetched, windowLoaded]).then((promisedValues) => {
    let fontConfigs = promisedValues[0];
    let fontConfig = selectFontConfig(fontConfigs, 'cmr', 'nr');

    // TODO: bind config to fonts
    // let microtypeCfg = {
    //       'MyFont': {
    //           'nr': selectFontConfig(fontConfigs, 'cmr', 'nr'),
    //           'it': selectFontConfig(fontConfigs, 'cmr', 'it')
    //       }
    // }

    let ps = document.querySelectorAll(".typeset p");
    console.log(ps)

    for (let p of ps) {
        let text = p.textContent;
        var style = window.getComputedStyle(p, null).getPropertyValue('font-size');
        var fontSize = parseFloat(style);
        typeset(p, {
            'fontSize': fontSize,
            'textWidth': 400,
            'minStretch': 0.98,
            'maxStretch': 1.02,
            'fontConfig': fontConfig,
        });
    }
});




