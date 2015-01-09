#!/bin/sh

git pull origin master -f && npm version $1 && git push origin master && git push --tags && npm publish