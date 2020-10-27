import {hyphenate, hyphenateSync} from "hyphen/en";
import fontConfigs from "../font-protrusion.json";


export default TypeEngine = {};


TypeEngine.linebreak = (function() {
    /**
     * The linebreaking alogrithm is adapted from https://github.com/robertknight/tex-linebreak
     * @preserve Knuth and Plass line breaking algorithm in JavaScript
     *
     * Licensed under the new BSD License.
     * Copyright 2009-2010, Bram Stein
     * All rights reserved.
     */
    var linebreak = function (nodes, lines, settings) {
        var options = {
            demerits: {
                line: settings && settings.demerits && settings.demerits.line || 10,
                flagged: settings && settings.demerits && settings.demerits.flagged || 100,
                fitness: settings && settings.demerits && settings.demerits.fitness || 3000
            },
            tolerance: settings && settings.tolerance || 2
        },
        activeNodes = new TypeEngine.LinkedList(),
        sum = {
            width: 0,
            stretch: 0,
            shrink: 0
        },
        lineLengths = lines,
        breaks = [],
        tmp = {
            data: {
                demerits: Infinity
            }
        };

        function breakpoint(position, demerits, ratio, line, fitnessClass, totals, previous) {
            return {
                position: position,
                demerits: demerits,
                ratio: ratio,
                line: line,
                fitnessClass: fitnessClass,
                totals: totals || {
                    width: 0,
                    stretch: 0,
                    shrink: 0
                },
                previous: previous
            };
        }

        function computeCost(start, end, active, currentLine) {
            var width = sum.width - active.totals.width,
            stretch = 0,
            shrink = 0,
            // If the current line index is within the list of linelengths, use it, otherwise use
            // the last line length of the list.
            lineLength = currentLine < lineLengths.length ? lineLengths[currentLine - 1] : lineLengths[lineLengths.length - 1];

            if (nodes[end].type === 'penalty') {
                width += nodes[end].width;
            }

            if (width < lineLength) {
                // Calculate the stretch ratio
                stretch = sum.stretch - active.totals.stretch;

                if (stretch > 0) {
                    return (lineLength - width) / stretch;
                } else {
                    return linebreak.infinity;
                }

            } else if (width > lineLength) {
                // Calculate the shrink ratio
                shrink = sum.shrink - active.totals.shrink;

                if (shrink > 0) {
                    return (lineLength - width) / shrink;
                } else {
                    return linebreak.infinity;
                }
            } else {
                // perfect match
                return 0;
            }
        }


        // Add width, stretch and shrink values from the current
        // break point up to the next box or forced penalty.
        function computeSum(breakPointIndex) {
            var result = {
                    width: sum.width,
                    stretch: sum.stretch,
                    shrink: sum.shrink
                },
                i = 0;

            for (i = breakPointIndex; i < nodes.length; i += 1) {
                if (nodes[i].type === 'glue') {
                    result.width += nodes[i].width;
                    result.stretch += nodes[i].stretch;
                    result.shrink += nodes[i].shrink;
                } else if (nodes[i].type === 'box' || (nodes[i].type === 'penalty' && nodes[i].penalty === -linebreak.infinity && i > breakPointIndex)) {
                    break;
                }
            }
            return result;
        }

        // The main loop of the algorithm
        function mainLoop(node, index, nodes) {
            var active = activeNodes.first(),
                next = null,
                ratio = 0,
                demerits = 0,
                candidates = [],
                badness,
                currentLine = 0,
                tmpSum,
                currentClass = 0,
                fitnessClass,
                candidate,
                newNode;

            // The inner loop iterates through all the active nodes with line < currentLine and then
            // breaks out to insert the new active node candidates before looking at the next active
            // nodes for the next lines. The result of this is that the active node list is always
            // sorted by line number.
            while (active !== null) {

                candidates = [{
                    demerits: Infinity
                }, {
                    demerits: Infinity
                }, {
                    demerits: Infinity
                }, {
                    demerits: Infinity
                }];

                // Iterate through the linked list of active nodes to find new potential active nodes
                // and deactivate current active nodes.
                while (active !== null) {
                    next = active.next;
                    currentLine = active.data.line + 1;
                    ratio = computeCost(active.data.position, index, active.data, currentLine);

                    // Deactive nodes when the distance between the current active node and the
                    // current node becomes too large (i.e. it exceeds the stretch limit and the stretch
                    // ratio becomes negative) or when the current node is a forced break (i.e. the end
                    // of the paragraph when we want to remove all active nodes, but possibly have a final
                    // candidate active node---if the paragraph can be set using the given tolerance value.)
                    if (ratio < -1 || (node.type === 'penalty' && node.penalty === -linebreak.infinity)) {
                        activeNodes.remove(active);
                    }

                    // If the ratio is within the valid range of -1 <= ratio <= tolerance calculate the
                    // total demerits and record a candidate active node.
                    if (-1 <= ratio && ratio <= options.tolerance) {
                        badness = 100 * Math.pow(Math.abs(ratio), 3);

                        // Positive penalty
                        if (node.type === 'penalty' && node.penalty >= 0) {
                            demerits = Math.pow(options.demerits.line + badness, 2) + Math.pow(node.penalty, 2);
                        // Negative penalty but not a forced break
                        } else if (node.type === 'penalty' && node.penalty !== -linebreak.infinity) {
                            demerits = Math.pow(options.demerits.line + badness, 2) - Math.pow(node.penalty, 2);
                        // All other cases
                        } else {
                            demerits = Math.pow(options.demerits.line + badness, 2);
                        }

                        if (node.type === 'penalty' && nodes[active.data.position].type === 'penalty') {
                            demerits += options.demerits.flagged * node.flagged * nodes[active.data.position].flagged;
                        }

                        // Calculate the fitness class for this candidate active node.
                        if (ratio < -0.5) {
                            currentClass = 0;
                        } else if (ratio <= 0.5) {
                            currentClass = 1;
                        } else if (ratio <= 1) {
                            currentClass = 2;
                        } else {
                            currentClass = 3;
                        }

                        // Add a fitness penalty to the demerits if the fitness classes of two adjacent lines
                        // differ too much.
                        if (Math.abs(currentClass - active.data.fitnessClass) > 1) {
                            demerits += options.demerits.fitness;
                        }

                        // Add the total demerits of the active node to get the total demerits of this candidate node.
                        demerits += active.data.demerits;

                        // Only store the best candidate for each fitness class
                        if (demerits < candidates[currentClass].demerits) {
                            candidates[currentClass] = {
                                active: active,
                                demerits: demerits,
                                ratio: ratio
                            };
                        }
                    }

                    active = next;

                    // Stop iterating through active nodes to insert new candidate active nodes in the active list
                    // before moving on to the active nodes for the next line.
                    // TODO: The Knuth and Plass paper suggests a conditional for currentLine < j0. This means paragraphs
                    // with identical line lengths will not be sorted by line number. Find out if that is a desirable outcome.
                    // For now I left this out, as it only adds minimal overhead to the algorithm and keeping the active node
                    // list sorted has a higher priority.
                    if (active !== null && active.data.line >= currentLine) {
                        break;
                    }
                }

                tmpSum = computeSum(index);

                for (fitnessClass = 0; fitnessClass < candidates.length; fitnessClass += 1) {
                    candidate = candidates[fitnessClass];

                    if (candidate.demerits < Infinity) {
                        newNode = new TypeEngine.LinkedList.Node(breakpoint(index, candidate.demerits, candidate.ratio,
                            candidate.active.data.line + 1, fitnessClass, tmpSum, candidate.active));
                        if (active !== null) {
                            activeNodes.insertBefore(active, newNode);
                        } else {
                            activeNodes.push(newNode);
                        }
                    }
                }
            }
        }

        // Add an active node for the start of the paragraph.
        activeNodes.push(new TypeEngine.LinkedList.Node(breakpoint(0, 0, 0, 0, 0, undefined, null)));

        nodes.forEach(function (node, index, nodes) {
            // console.log(node)
            if (node.type === 'box') {
                sum.width += node.width;
            } else if (node.type === 'glue') {
                if (index > 0 && nodes[index - 1].type === 'box') {
                    mainLoop(node, index, nodes);
                }
                sum.width += node.width;
                sum.stretch += node.stretch;
                sum.shrink += node.shrink;
            } else if (node.type === 'penalty' && node.penalty !== linebreak.infinity) {
                mainLoop(node, index, nodes);
            }
        });


        if (activeNodes.size() !== 0) {
            // Find the best active node (the one with the least total demerits.)
            activeNodes.forEach(function (node) {
                if (node.data.demerits < tmp.data.demerits) {
                    tmp = node;
                }
            });

            while (tmp !== null) {
                breaks.push({
                    position: tmp.data.position,
                    ratio: tmp.data.ratio
                });
                tmp = tmp.data.previous;
            }
            return breaks.reverse();
        }
        return [];
    };

    linebreak.infinity = 10000;

    linebreak.glue = function (width, stretch, shrink, elem) {
        return {
            type: 'glue',
            width: width,
            stretch: stretch,
            shrink: shrink,
            elem: elem,
        };
    };

    linebreak.box = function (width, value, elem, stretchable) {
        return {
            type: 'box',
            width: width,
            value: value,
            elem: elem,
            stretchable: stretchable,
        };
    };

    linebreak.penalty = function (width, penalty, flagged, elem) {
        return {
            type: 'penalty',
            width: width,
            penalty: penalty,
            flagged: flagged,
            elem: elem,
        };
    };

    return linebreak;

})();


TypeEngine.LinkedList = (function(undefined) {

    function LinkedList() {
        this.head = null;
        this.tail = null;
        this.listSize = 0;
    };

    LinkedList.Node = function (data) {
        this.prev = null;
        this.next = null;
        this.data = data;
    };

    LinkedList.Node.prototype.toString = function () {
        return this.data.toString();
    };

    LinkedList.prototype.isLinked = function (node) {
        return !((node && node.prev === null && node.next === null && this.tail !== node && this.head !== node) || this.isEmpty());
    };

    LinkedList.prototype.size = function () {
        return this.listSize;
    };

    LinkedList.prototype.isEmpty = function () {
        return this.listSize === 0;
    };

    LinkedList.prototype.first = function () {
        return this.head;
    };

    LinkedList.prototype.last = function () {
        return this.last;
    };

    LinkedList.prototype.toString = function () {
        return this.toArray().toString();
    };

    LinkedList.prototype.toArray = function () {
        var node = this.head,
        result = [];
        while (node !== null) {
            result.push(node);
            node = node.next;
        }
        return result;
    };

    // Note that modifying the list during
    // iteration is not safe.
    LinkedList.prototype.forEach = function (fun) {
        var node = this.head;
        while (node !== null) {
            fun(node);
            node = node.next;
        }
    };

    LinkedList.prototype.contains = function (n) {
        var node = this.head;
        if (!this.isLinked(n)) {
            return false;
        }
        while (node !== null) {
            if (node === n) {
                return true;
            }
            node = node.next;
        }
        return false;
    };

    LinkedList.prototype.at = function (i) {
        var node = this.head, index = 0;

        if (i >= this.listLength || i < 0) {
            return null;
        }

        while (node !== null) {
            if (i === index) {
                return node;
            }
            node = node.next;
            index += 1;
        }
        return null;
    };

    LinkedList.prototype.insertAfter = function (node, newNode) {
        if (!this.isLinked(node)) {
            return this;
        }
        newNode.prev = node;
        newNode.next = node.next;
        if (node.next === null) {
            this.tail = newNode;
        } else {
            node.next.prev = newNode;
        }
        node.next = newNode;
        this.listSize += 1;
        return this;
    };

    LinkedList.prototype.insertBefore = function (node, newNode) {
        if (!this.isLinked(node)) {
            return this;
        }
        newNode.prev = node.prev;
        newNode.next = node;
        if (node.prev === null) {
            this.head = newNode;
        } else {
            node.prev.next = newNode;
        }
        node.prev = newNode;
        this.listSize += 1;
        return this;
    };

    LinkedList.prototype.push = function (node) {
        if (this.head === null) {
            this.unshift(node);
        } else {
            this.insertAfter(this.tail, node);
        }
        return this;
    };

    LinkedList.prototype.unshift = function (node) {
        if (this.head === null) {
            this.head = node;
            this.tail = node;
            node.prev = null;
            node.next = null;
            this.listSize += 1;
        } else {
            this.insertBefore(this.head, node);
        }
        return this;
    };

    LinkedList.prototype.remove = function (node) {
        if (!this.isLinked(node)) {
            return this;
        }
        if (node.prev === null) {
            this.head = node.next;
        } else {
            node.prev.next = node.next;
        }
        if (node.next === null) {
            this.tail = node.prev;
        } else {
            node.next.prev = node.prev;
        }
        this.listSize -= 1;
        return this;
    };

    LinkedList.prototype.pop = function () {
        var node = this.tail;
        this.tail.prev.next = null;
        this.tail = this.tail.prev;
        this.listSize -= 1;
        node.prev = null;
        node.next = null;
        return node;
    };

    LinkedList.prototype.shift = function () {
        var node = this.head;
        this.head.next.prev = null;
        this.head = this.head.next;
        this.listSize -= 1;
        node.prev = null;
        node.next = null;
        return node;
    };

    return LinkedList;
})();


/*global TypeEngine.linebreak*/

/*!
 * Knuth and Plass line breaking algorithm in JavaScript
 *
 * Licensed under the new BSD License.
 * Copyright 2009-2010, Bram Stein
 * All rights reserved.
 */
/*
TypeEngine.formatter = function (measureText, hyphenate, options) {
    var linebreak = TypeEngine.linebreak;

    var spaceWidth = measureText(' '),
        o = {
            space: {
                width: options && options.space.width || 3,
                stretch: options && options.space.stretch || 6,
                shrink: options && options.space.shrink || 9
            }
        },
        hyphenWidth = measureText('-'),
        hyphenPenalty = 100;

    return {
        center: function (text) {
            var nodes = [],
            words = text.split(/\s/),
            spaceStretch = (spaceWidth * o.space.width) / o.space.stretch,
            spaceShrink = (spaceWidth * o.space.width) / o.space.shrink;

            // Although not specified in the Knuth and Plass whitepaper, this box is necessary
            // to keep the glue from disappearing.
            nodes.push(linebreak.box(0, ''));
            nodes.push(linebreak.glue(0, 12, 0));

            words.forEach(function (word, index, array) {
                var hyphenated = hyphenate(word);
                if (hyphenated.length > 1 && word.length > 4) {
                    hyphenated.forEach(function (part, partIndex, partArray) {
                        nodes.push(linebreak.box(measureText(part), part));
                        if (partIndex !== partArray.length - 1) {
                            nodes.push(linebreak.penalty(hyphenWidth, hyphenPenalty, 1));
                        }
                    });
                } else {
                    nodes.push(linebreak.box(measureText(word), word));
                }

                if (index === array.length - 1) {
                    nodes.push(linebreak.glue(0, 12, 0));
                    nodes.push(linebreak.penalty(0, -linebreak.infinity, 0));
                } else {
                    nodes.push(linebreak.glue(0, 12, 0));
                    nodes.push(linebreak.penalty(0, 0, 0));
                    nodes.push(linebreak.glue(spaceWidth, -24, 0));
                    nodes.push(linebreak.box(0, ''));
                    nodes.push(linebreak.penalty(0, linebreak.infinity, 0));
                    nodes.push(linebreak.glue(0, 12, 0));
                }
            });
            return nodes;
        },
        justify: function (text) {
            var nodes = [],
            words = text.split(/\s/),
            spaceStretch = (spaceWidth * o.space.width) / o.space.stretch,
            spaceShrink = (spaceWidth * o.space.width) / o.space.shrink;

            words.forEach(function (word, index, array) {
                var hyphenated = hyphenate(word);
                if (hyphenated.length > 1 && word.length > 4) {
                    hyphenated.forEach(function (part, partIndex, partArray) {
                        nodes.push(linebreak.box(measureText(part), part));
                        if (partIndex !== partArray.length - 1) {
                            nodes.push(linebreak.penalty(hyphenWidth, hyphenPenalty, 1));
                        }
                    });
                } else {
                    nodes.push(linebreak.box(measureText(word), word));
                }
                if (index === array.length - 1) {
                    nodes.push(linebreak.glue(0, linebreak.infinity, 0));
                    nodes.push(linebreak.penalty(0, -linebreak.infinity, 1));
                } else {
                    nodes.push(linebreak.glue(spaceWidth, spaceStretch, spaceShrink));
                }
            });
            return nodes;
        },
        left: function (text) {
            var nodes = [],
            words = text.split(/\s/),
            spaceStretch = (spaceWidth * o.space.width) / o.space.stretch,
            spaceShrink = (spaceWidth * o.space.width) / o.space.shrink;

            words.forEach(function (word, index, array) {
                var hyphenated = hyphenate(word);
                if (hyphenated.length > 1 && word.length > 4) {
                    hyphenated.forEach(function (part, partIndex, partArray) {
                        nodes.push(linebreak.box(measureText(part), part));
                        if (partIndex !== partArray.length - 1) {
                            nodes.push(linebreak.penalty(hyphenWidth, hyphenPenalty, 1));
                        }
                    });
                } else {
                    nodes.push(linebreak.box(measureText(word), word));
                }

                if (index === array.length - 1) {
                    nodes.push(linebreak.glue(0, linebreak.infinity, 0));
                    nodes.push(linebreak.penalty(0, -linebreak.infinity, 1));
                } else {
                    nodes.push(linebreak.glue(0, 12, 0));
                    nodes.push(linebreak.penalty(0, 0, 0));
                    nodes.push(linebreak.glue(spaceWidth, -12, 0));
                }
            });
            return nodes;
        }
    };
};

TypeEngine.formatter.defaults = {
    space: {
        width: 3,
        stretch: 6,
        shrink: 9
    }
};
*/

TypeEngine.typeset = function (containerElem, options) {
    function createSpan(part) {
        let elem = document.createElement('span');
        elem.innerHTML = part;
        return elem;
    }
    function spanifyPart(part, parentNode) {
        let elem = createSpan(part);
        elem.setAttribute('style', 'word-break: keep-all; line-break:strict; white-space: nowrap;');
        parentNode.appendChild(elem);
        let rect = elem.getBoundingClientRect();
        let width = rect.width;
        if (width > 100) {
            console.log("BAD", width, part);
        }
        return [width, elem];
    };
    function spanifyWords(words, parentNode, hyphenWidth) {
        let isFontStretchable = () => true;
        let nodes = [];

        words.filter(word => word !== "").forEach(function (word, index, array) {
            var hyphenated = hyphenateSync(word).split(hyphenShy);
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
            var hyphenated = hyphenateSync(word).split(String.fromCodePoint(0x00AD));
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
                    let br = document.createElement('br');
                    hyphenElem.after(br);
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
            let linewidthWOverhang = linewidth - overhangMargin + overhang + 2*borderWidth*nBoxes;
            //linewidthWOverhang = linewidth; // - overhangMargin + overhang + 2*borderWidth*nBoxes;
            let unusedOverhang = linewidth - linewidthWOverhang;
            let nonStretchableBox = boxWidth - stretchableBoxWidth;
            let perfectStretch = (linewidthWOverhang - nGlues * space.width - nonStretchableBox) / stretchableBoxWidth;

            if (options.stretch === 'none') {
                var stretch = 1;
            } else {
                var stretch = Math.max(options.minStretch, Math.min(perfectStretch, options.maxStretch));
            }
            // stretch = perfectStretch;
            // stretch = 0.9;
            let stretchPerc = stretch * 100;
            let boxWidthStretched = stretchableBoxWidth * stretch;
            let extraBoxWidth = 0;
            if (options.stretch !== 'none') {
                // needed to fix webkit and chrome low size resolutions
                extraBoxWidth = 0.003;
            }

            let extraBoxWidthTotal = extraBoxWidth * boxWidth;
            let totalWhiteSpace = (linewidthWOverhang - boxWidthStretched - nonStretchableBox
                                   - extraBoxWidthTotal
                                   - 2*borderWidth*nBoxes);
            let resolution = 1000000;
            let adaptedSpaceWidth = Math.round(resolution * totalWhiteSpace / nGlues) / resolution;
            console.log({
                breakIdx: breakIdx,
                overhang: overhang,
                overhangRight: overhangRight,
                perfectStretch: perfectStretch,
                nonStretchableBox: nonStretchableBox,
                glueWidth: glueWidth,
                glueWidthPerGlue: glueWidth / nGlues,
                adaptedSpaceWidth: adaptedSpaceWidth,
                totalWhiteSpace: totalWhiteSpace,
                boxWidth: boxWidth,
                boxWidthStretched: boxWidthStretched,
                linewidthWOverhang: linewidthWOverhang,
                unusedOverhang: unusedOverhang,
                check: linewidthWOverhang + unusedOverhang,
                check2: nGlues * adaptedSpaceWidth + boxWidthStretched
            });
            unusedOverhang = Math.max(0, unusedOverhang - 2);
            for (let j=startIdx; j <= endIdx; j++) {
                let node = nodes[j];
                // console.log(node);
                if (node.type == 'box') {
                    // margin-left: -1px; margin-right: -1px;
                    let style = "display: inline-block; inline-size: fit-content;";
                    if (j == firstNodeIdx) {
                        style += `margin-left: -${overhangLeft}px;`;
                    }
                    if (node.stretchable) {
                        let scaledNodeWidth = node.width * stretch * (extraBoxWidth + 1);
                        if (options.stretch === 'font-stretch') {
                            style += `width: ${scaledNodeWidth}px; font-stretch: ${stretchPerc}%;`;
                        } else if (options.stretch === 'transform') {
                            style += `width: ${node.width * (extraBoxWidth + 1)}px; margin-right: ${scaledNodeWidth-node.width}px; transform: scaleX(${stretch}); transform-origin: 0 0;`;
                        }
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
                    node.elem.setAttribute('style', 'display: inline-block');
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
        width: options.space.width * fontSize,
        stretch: 0,
        shrink: 0
    };

    space.stretch = space.width * options.space.stretch;
    space.shrink = space.width * options.space.shrink;

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
    let tolerance = 0;
    for (; breaks.length === 0 && tolerance <= 10; tolerance++) {
        breaks = TypeEngine.linebreak(inlineNodes, [textWidth], {'tolerance': tolerance});
    }
    var t1 = performance.now();
    console.log("Line Breaking took " + (t1 - t0) + " milliseconds. Tolerance: " + tolerance);

    console.log('breaks', breaks);
    //let formattedText = formatterText(inlineNodes, breaks, [textWidth]);
    formatterHTML(inlineNodes, breaks, [textWidth - 2]);
}


function selectFontConfig(fontConfigs, name, shape) {
    for (let cfg of fontConfigs) {
        console.log(cfg.font);
        if (cfg.font === name && cfg.shape == shape) {
            return cfg;
        }
    }
}

window.addEventListener("load", function(event) {
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
        TypeEngine.typeset(p, {
            'fontSize': fontSize,
            'textWidth': 400,
            'minStretch': 0.98,
            'maxStretch': 1.02,
            'fontConfig': fontConfig,
            //'stretch': 'font-stretch',
            'stretch': 'transform',
            'space': {
                width: 1./4.,
                stretch: 1/2.,
                shrink: 1/3.,
            }
        });
    }
});
