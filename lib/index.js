/**
 * @fileoverview Error handling middleware for Express.
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var fs = require("fs"),
    path = require("path"),
    mustache = require("mustache");

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

// pattern to extract details from stack trace lines
var LINE_PATTERN = /\((.*?):(\d+):\d+\)$/;

/**
 * Processes an error stack to find the true filename and line number of the code
 * that caused the error.
 * @param {string} An error stack from an error object.
 * @returns {Object} Containing a filename key and a lineNumber key.
 */
function processStack(stack) {

    var filename = "",
        lineNumber = 0,
        lines = stack.split("\n"),
        matches,
        i, len;

    for (i = 0, len = lines.length; i < len; i++) {
        matches = lines[i].match(LINE_PATTERN);

        if (matches) {

            // skip over the Node.js builtins and any external dependencies
            if (matches[1] !== "module.js" && matches[1].indexOf("node_modules") === -1) {
                filename = matches[1];
                lineNumber = Number(matches[2]);
                break;
            }
        }
    }

    return {
        filename: filename,
        lineNumber: lineNumber
    };
}

/**
 * Retrieves file snippet information for the given filename. This method runs
 * asynchronously. It goes through the given file and pulls out the surrounding
 * ten lines of code around the given line number.
 * @param {string} filename The name of the file to get information for.
 * @param {int} lineNumber The line number that caused the problem.
 * @param {Function} callback The callback to call with results.
 * @returns {void}
 * @private
 */
function getFileSnippet(filename, lineNumber, callback) {
    fs.readFile(filename, "utf8", function(err, code) {

        if (err) {
            callback(err);
        }

        var lines = code.split(/\r?\n/g),
            startLine = Math.max(0, lineNumber - 5),
            stopLine = Math.min(lines.length, lineNumber + 5),
            neededLines = lines.slice(startLine, stopLine);

        callback(null, neededLines.map(function(value, i) {
            return {
                number: startLine + i,
                error: (startLine + i) === lineNumber,
                code: value.replace("\t", "    ")
            };
        }));
    });
}

//------------------------------------------------------------------------------
// Public
//------------------------------------------------------------------------------

module.exports = function(err, req, res, next) {

    var accept = req.headers.accept || "",
        filename = err.fileName || err.filename || "",
        lineNumber = err.lineNumber || "",
        status = err.status || 500,
        result;

    if (!filename) {
        result = processStack(err.stack);
        filename = result.filename;
        lineNumber = result.lineNumber - 1;     // always off by one
    }

    if (/html/.test(accept)) {

        fs.readFile(path.resolve(__dirname, "../public/error.html"), "utf8", function(e, template) {

            getFileSnippet(filename, lineNumber, function(e, lines) {

                res.setHeader("Content-Type", "text/html");
                res.send(status, mustache.render(template, {
                    message: err.message,
                    stack: err.stack,
                    lines: lines,
                    filename: filename,
                    lineNumber: lineNumber,
                    status: status
                }));
            });

        });

    } else if (/json/.test(accept)) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            message: err.message,
            stack: err.stack
        }));
    } else {
        res.setHeader("Content-Type", "text/plain");
        res.end(err.stack);
    }

};
