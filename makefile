# Makefile for JDrakoon3 (Windows with GNU Make)
SHELL = cmd.exe
BACKEND_DIR = backend
CONSOLE_DIR = couch-console
REMOTE_DIR = couch-remote
FRONTEND_BUILD = $(BACKEND_DIR)\\frontend-build

.PHONY: build clean run dev all help frontend backend console remote kill

help:
	@echo Available targets: build, clean, run, dev, frontend, backend

all: build run

frontend:
	@echo Building couch-console...
	cd $(CONSOLE_DIR) && call npm install && call npm run build
	@echo Copying couch-console to backend/frontend-build...
	if not exist $(FRONTEND_BUILD) mkdir $(FRONTEND_BUILD)
	xcopy $(CONSOLE_DIR)\\dist\\* $(FRONTEND_BUILD) /E /I /Y
	@echo Building couch-remote...
	cd $(REMOTE_DIR) && call npm install && call npm run build
	@echo Copying couch-remote to backend/frontend-build/phone...
	if not exist $(FRONTEND_BUILD)\\phone mkdir $(FRONTEND_BUILD)\\phone
	xcopy $(REMOTE_DIR)\\dist\\* $(FRONTEND_BUILD)\\phone /E /I /Y

backend:
	@echo Building backend...
	cd $(BACKEND_DIR) && call npm run build

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
	cd $(BACKEND_DIR) && call npm start

dev:
	@echo Starting backend (development)...
	cd $(BACKEND_DIR) && call npm run dev

console:
	@echo Starting couch-console...
	cd $(CONSOLE_DIR) && call npm run dev

remote:
	@echo Starting couch-remote...
	cd $(REMOTE_DIR) && call npm run dev

kill:
	@echo Killing ports 3000, 3001, 5173, 5174...
	@for %%p in (3000 3001 5173 5174) do ( \
		for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do taskkill /F /PID %%a \
	)
	@echo Done.