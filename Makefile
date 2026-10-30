# Sisu TV - build helpers
# `make` on its own runs the tests and packages the IPK.

PORT ?= 4173
NODE ?= node

.PHONY: all test package preview icons clean help

all: test package

help:
	@echo "make test      run the unit tests"
	@echo "make package   build build/com.syntaxsaboteur.sisutv_<version>_all.ipk"
	@echo "make preview   serve app/ on http://localhost:$(PORT)/"
	@echo "make icons     regenerate the launcher icons (needs Pillow)"
	@echo "make clean     remove build/"

test:
	$(NODE) --test "test/*.test.mjs"

package:
	$(NODE) tools/build-ipk.mjs --clean

preview:
	$(NODE) tools/preview-server.mjs $(PORT)

icons:
	python3 tools/make_icons.py

clean:
	rm -rf build
