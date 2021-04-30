"""
jupyterlab_execute_time setup
"""
import json
import os

from jupyter_packaging import wrap_installers, npm_builder, get_data_files
import setuptools

HERE = os.path.abspath(os.path.dirname(__file__))

# The name of the project
name = "jupyterlab_execute_time"

# Get our version
with open(os.path.join(HERE, "package.json")) as f:
    version = json.load(f)["version"]

lab_path = os.path.join(HERE, name, "labextension")

# Representative files that should exist after a successful build
ensured_targets = [
    os.path.join(lab_path, "package.json"),
]

labext_name = "jupyterlab-execute-time"

data_files_spec = [
    ("share/jupyter/labextensions/%s" % labext_name, lab_path, "**"),
    ("share/jupyter/labextensions/%s" % labext_name, HERE, "install.json"),
]

post_develop = npm_builder(
    build_cmd="install:extension", source_dir="src", build_dir=lab_path
)
cmdclass = wrap_installers(post_develop=post_develop, ensured_targets=ensured_targets)

with open("README.md", "r") as fh:
    long_description = fh.read()

setup_args = dict(
    name=name,
    version=version,
    url="https://github.com/deshaw/jupyterlab-execute-time.git",
    author="Marc Udoff",
    description="Display cell timings in Jupyter Lab",
    long_description=long_description,
    long_description_content_type="text/markdown",
    cmdclass=cmdclass,
    data_files=get_data_files(data_files_spec),
    packages=setuptools.find_packages(),
    install_requires=["jupyterlab>=3.0.0rc13,<4", "jupyter_packaging~=0.9,<2"],
    zip_safe=False,
    include_package_data=True,
    python_requires=">=3.6",
    license="BSD-3-Clause",
    platforms="Linux, Mac OS X, Windows",
    keywords=["Jupyter", "JupyterLab", "JupyterLab3"],
    classifiers=[
        "License :: OSI Approved :: BSD License",
        "Programming Language :: Python",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Framework :: Jupyter",
    ],
)


if __name__ == "__main__":
    setuptools.setup(**setup_args)
