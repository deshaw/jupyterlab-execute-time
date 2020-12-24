# jupyterlab-execute-time

[![Binder][badge-binder]][binder]
[![NPM version][npm-image]][npm-url] [![NPM DM][npm-dm-image]][npm-url] [![Build Status][travis-image]][travis-url]

Display cell timings.

![Execute Time Screenshot](https://github.com/deshaw/jupyterlab-execute-time/blob/master/docs/execute-time-screenshot.png?raw=true)

This is inspired by the notebook version [here](https://github.com/ipython-contrib/jupyter_contrib_nbextensions/blob/master/src/jupyter_contrib_nbextensions/nbextensions/execute_time).

Note: for this to show anything, you need to enable cell timing in the notebook via Settings->Advanced Settings Editor->Notebook: `{"recordTiming": true}`. This is a notebook metadata setting and not a plugin setting. The plugin just displays this data.

"Jupyter" is a trademark of the NumFOCUS foundation, of which Project Jupyter is a part."

## Requirements

- JupyterLab >= 2.0.2

## Install

```bash
jupyter labextension install jupyterlab-execute-time
```

## Contributing

### Install

```bash
# Clone the repo to your local environment
# Move to jupyterlab-execute-time directory
# Install dependencies
yarn
# Build Typescript source
yarn run build
# Link your development version of the extension with JupyterLab
jupyter labextension link .
# Rebuild Typescript source after making changes
yarn run build
# Rebuild JupyterLab after making any changes
jupyter lab build
```

You can watch the source directory and run JupyterLab in watch mode to watch for changes in the extension's source and automatically rebuild the extension and application.

```bash
# Watch the source directory in another terminal tab
yarn run watch
# Run jupyterlab in watch mode in one terminal tab
jupyter lab --watch
```

To test:

```bash
yarn run test
```

### Uninstall

```bash
jupyter labextension uninstall jupyterlab-execute-time
```

## History

This plugin was contributed back to the community by the [D. E. Shaw group](https://www.deshaw.com/).

<p align="center">
    <a href="https://www.deshaw.com">
       <img src="https://www.deshaw.com/assets/logos/black_logo_417x125.png" alt="D. E. Shaw Logo" height="75" >
    </a>
</p>

## License

This project is released under a [BSD-3-Clause license](https://github.com/deshaw/jupyterlab-execute-time/blob/master/LICENSE.txt).

"Jupyter" is a trademark of the NumFOCUS foundation, of which Project Jupyter is a part.

[npm-url]: https://npmjs.org/package/jupyterlab-execute-time
[npm-image]: https://badge.fury.io/js/jupyterlab-execute-time.png
[npm-dm-image]: https://img.shields.io/npm/dm/jupyterlab-execute-time.svg
[travis-url]: http://travis-ci.org/deshaw/jupyterlab-execute-time
[travis-image]: https://secure.travis-ci.org/deshaw/jupyterlab-execute-time.png?branch=master
[badge-binder]: https://mybinder.org/badge_logo.svg
[binder]: https://mybinder.org/v2/gh/deshaw/jupyterlab-execute-time/master?urlpath=lab%2Ftree%2Fnotebooks%2Findex.ipynb
