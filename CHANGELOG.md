## [3.1.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v3.0.1...v3.1.0) (unreleased)

### Added

- Make display of last execution date optional [#94](https://github.com/deshaw/jupyterlab-execute-time/pull/94)
- Enable defining custom date format [#93](https://github.com/deshaw/jupyterlab-execute-time/pull/93)

### Fixed

- Fix node attachment issue with windowed notebook [#102](https://github.com/deshaw/jupyterlab-execute-time/pull/102)

## [3.0.1](https://github.com/deshaw/jupyterlab-execute-time/compare/v3.0.0...v3.0.1) (2023-08-02)

### Changed

- Ensure this only installs with Jupyterlab@4

## ~[3.0.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.3.1...v3.0.0) (2023-05-19)~

### Changed

- **Breaking**: Ported to JupyterLab 4.x.

## [2.3.1](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.3.0...v2.3.1) (2022-12-28)

### Fixed

- Enable to use jupyter-server2.x.

## [2.3.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.2.0...v2.3.0) (2022-11-03)

### Added

- Live execution time relative to last runtime. [#72](https://github.com/deshaw/jupyterlab-execute-time/pull/72)
- Recent history of cell run timing via tooltip. [#72](https://github.com/deshaw/jupyterlab-execute-time/pull/72)
- Auto opt-in to recoding cell timing for all notebooks. [#73](https://github.com/deshaw/jupyterlab-execute-time/pull/73)

## [2.2.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.1.0...v2.2.0) (2022-03-04)

### Added

- Add a Text Contrast setting that allows users to select text color contrast.

## [2.1.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.5...v2.1.0) (2021-10-01)

### Added

- Ability to keep only cell execution time for cells that took longer than a threshold (still defaults to always show)

### Fixed

- Click on a execute time output also selects the cell
- Coloring when used with certain themes

## [2.0.5](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.4...v2.0.5) (2021-7-12)

### Fixed

- Issues with build

## [2.0.4](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.3...v2.0.4) (2021-6-12)

### Fixed

- Duplicates with collapsed cell

## [2.0.3](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.2...v2.0.3) (2021-5-21)

### Fixed

- Build system update

## [2.0.2](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.1...v2.0.2) (2021-2-17)

### Fixed

- Allow for all of lab@3.x to be used

## [2.0.1](https://github.com/deshaw/jupyterlab-execute-time/compare/v2.0.0...v2.0.1) (2021-01-19)

### Added

- Fix broken README in release

## [2.0.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v1.1.0...v2.0.0) (2021-01-19)

### Changed

- **Breaking**: Adds support for Jupyterlab@3.x and removes support for Jupyterlab@2.x. To migrate, after installing Jupyterlab@3.x run `pip install jupyterlab_execute_time`.

## [1.1.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v1.0.0...v1.1.0) (2021-01-18)

### Added

- The ability to specify the position of the execute time (`left`, `right` or `hover`) ([#16](https://github.com/deshaw/jupyterlab-execute-time/pull/16), [#17](https://github.com/deshaw/jupyterlab-execute-time/pull/17))

## [1.0.0](https://github.com/deshaw/jupyterlab-execute-time/compare/v1.0.0...v1.0.0) (2020-04-07)

### Added

- Public release

The project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and
this CHANGELOG follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) standard.
