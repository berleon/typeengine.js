
/*global TypeEngine.LinkedList*/

if ("undefined" === typeof TypeEngine) {
    var TypeEngine = {};
}

TypeEngine.linebreak = (function() {

    /**
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
