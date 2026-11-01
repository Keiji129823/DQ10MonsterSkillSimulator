@echo off
cd /d "%~dp0"
python "%~dp0scripts\start_simulator.py"
if errorlevel 1 pause
