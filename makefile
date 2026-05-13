# Makefile for JDrakoon3 (Windows with GNU Make)
SHELL = cmd.exe
BACKEND_DIR = backend
CONSOLE_DIR = couch-console
REMOTE_DIR = couch-remote
FRONTEND_BUILD = $(BACKEND_DIR)\\frontend-build

.PHONY: build clean run dev all help

help:
	@echo Available targets: build, clean, run, dev, frontend, backend

all: build run

frontend:
	@echo Building couch-console...
	cd $(CONSOLE_DIR) && npm install && npm run build
	@echo Copying couch-console to backend/frontend-build...
	if not exist $(FRONTEND_BUILD) mkdir $(FRONTEND_BUILD)
	xcopy $(CONSOLE_DIR)\\dist\\* $(FRONTEND_BUILD) /E /I /Y
	@echo Building couch-remote...
	cd $(REMOTE_DIR) && npm install && npm run build
	@echo Copying couch-remote to backend/frontend-build/phone...
	if not exist $(FRONTEND_BUILD)\\phone mkdir $(FRONTEND_BUILD)\\phone
	xcopy $(REMOTE_DIR)\\dist\\* $(FRONTEND_BUILD)\\phone /E /I /Y

backend:
	@echo Building backend...
	cd $(BACKEND_DIR) && npm run build

build: frontend backend

clean:
	@echo Cleaning couch-console...
	cd $(CONSOLE_DIR) && if exist node_modules rmdir /s /q node_modules && if exist dist rmdir /s /q dist
	@echo Cleaning couch-remote...
	cd $(REMOTE_DIR) && if exist node_modules rmdir /s /q node_modules && if exist dist rmdir /s /q dist
	@echo Cleaning backend...
	cd $(BACKEND_DIR) && if exist node_modules rmdir /s /q node_modules && if exist dist rmdir /s /q dist && if exist frontend-build rmdir /s /q frontend-build
	@echo Clean complete.

run:
	@echo Starting backend (production)...
	cd $(BACKEND_DIR) && npm start

dev:
	@echo Starting backend (development)...
	cd $(BACKEND_DIR) && npm run dev