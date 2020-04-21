# typeengine.js - bring the beauty of LaTeX to the web

Here is the same paragraph set with Firefox (`text-align: justify`),
`typengine.js`, and LaTex:




I think as long typesetting in the web is ugly, PDF will remain the goto format
for scientific publishing. I hope this project encurages more HTML5 based publishing.

`typeengine.js` uses some advanced micro typography features:

- Condencing an expansion of the font by a few percent (using `transform: yScale()`).
- Protrusion of the Margin, e.g. moving `.` out of the margin (settings parsed from [microtype](https://ctan.org/pkg/microtype?lang=de)).
- Implements the [Knuth \& Plass](https://onlinelibrary.wiley.com/doi/abs/10.1002/spe.4380111102) linebreaking algorithm.

This project build upon the [`tex-linebreak`](https://github.com/robertknight/tex-linebreak) by
Robert Knight.

## How to use?

For now, please see the [example code](docs/examples/).
If people are interested in using this libary, I will add a better explanation.

## Possible Improvments

- When calculating overhangs, match Unicode points to closest ASCII code point: `А̊  -> A`.
see [stackoverflow](https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript)
- The microtype functionallity is currently not considered when calculating
  linebreaks.
- Improve performance, maybe add some server side or static rendering capabilities.
- Add a slightly larger whitespace at a sentence end as LaTex.
- Make this project follow good javascript library

## Further Links

- The Hàn Thế Thành's  [PhD Thesis](http://www.pragma-ade.com/pdftex/thesis.pdf) documents well how
microtyping works, is well written and is a nice introduction how `pdflatex` works.

## Contributions

Contributions are always welcome!
