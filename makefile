# Makefile for JDrakoon3 (Windows with GNU Make)
SHELL = cmd.exe
BACKEND_DIR = backend
CONSOLE_DIR = couch-console
REMOTE_DIR = couch-remote
FRONTEND_BUILD = $(BACKEND_DIR)\\frontend-build

.PHONY: build clean run dev all help frontend backend console remote kill release

help:
	@echo Available targets: build, clean, run, dev, frontend, backend, release

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
	@echo Starting backend in a new window...
	cmd /c start "JDrakoon Backend" cmd /c "cd /d $(BACKEND_DIR) && npm start"

PID_FILE=.backend.pid

dev:
	@echo Killing previous backend if exists...
	@powershell -Command "if (Test-Path '$(PID_FILE)') { $$p = Get-Content '$(PID_FILE)'; Stop-Process -Id $$p -Force -ErrorAction SilentlyContinue; Remove-Item '$(PID_FILE)' -ErrorAction SilentlyContinue }"

	@echo Starting backend...
	@powershell -Command "$$proc = Start-Process cmd -ArgumentList '/k cd /d $(BACKEND_DIR) && npm run dev' -PassThru; $$proc.Id | Out-File -Encoding ascii '$(PID_FILE)'"
		
console:
	@echo Starting couch-console in a new window...
	cmd /c start "Couch Console" cmd /c "cd /d $(CONSOLE_DIR) && npm run dev"

remote:
	@echo Starting couch-remote in a new window...
	cmd /c start "Couch Remote" cmd /c "cd /d $(REMOTE_DIR) && npm run dev"

kill:
	@echo Killing ports 3000, 3001, 5173, 5174...
	@for %%p in (3000 3001 5173 5174) do ( \
		for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING') do taskkill /F /PID %%a \
	)
	@echo Done.

unused:
	cd $(BACKEND_DIR) && npx depcheck
	cd $(CONSOLE_DIR) && npx depcheck
	cd $(REMOTE_DIR) && npx depcheck

release:
	@echo Building and publishing release...
	powershell -ExecutionPolicy Bypass -File .\release.ps1

#powershell -ExecutionPolicy Bypass -File .\release.ps1 -Version 3.0.6   # bump first
#powershell -ExecutionPolicy Bypass -File .\release.ps1 -Force     # overwrite an existing release
