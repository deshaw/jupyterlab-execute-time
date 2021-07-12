"""
jupyterlab_execute_time setup.
"""
import json
from pathlib import Path
import setuptools
from jupyter_packaging import wrap_installers, npm_builder, get_data_files

HERE = Path(__file__).parent.resolve()

# The name of the project
name = "jupyterlab_execute_time"

lab_path = HERE / name.replace("-", "_") / "labextension"

# Representative files that should exist after a successful build
ensured_targets = [str(lab_path / "package.json"), str(lab_path / "static/style.js")]

labext_name = "jupyterlab-execute-time"

data_files_spec = [
    (
        "share/jupyter/labextensions/%s" % labext_name,
        str(lab_path.relative_to(HERE)),
        "**",
    ),
    ("share/jupyter/labextensions/%s" % labext_name, str("."), "install.json"),
]
long_description = (HERE / "README.md").read_text()

# Get the package info from package.json
pkg_json = json.loads((HERE / "package.json").read_bytes())

setup_args = dict(
    name=name,
    version=pkg_json["version"],
    url=pkg_json["homepage"],
    author="Marc Udoff",
    description=pkg_json["description"],
    license=pkg_json["license"],
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=setuptools.find_packages(),
    install_requires=["jupyter_server>=1.6,<2"],
    zip_safe=False,
    include_package_data=True,
    python_requires=">=3.6",
    platforms="Linux, Mac OS X, Windows",
    keywords=["Jupyter", "JupyterLab", "JupyterLab3"],
    classifiers=[
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Framework :: Jupyter",
    ],
)


post_develop = npm_builder(
    build_cmd="install:extension", source_dir="src", build_dir=lab_path
)
setup_args["cmdclass"] = wrap_installers(
    post_develop=post_develop, ensured_targets=ensured_targets
)
setup_args["data_files"] = get_data_files(data_files_spec)

if __name__ == "__main__":
    setuptools.setup(**setup_args)
