' ============================================
'  Jarvis OS - chạy NGẦM (ẩn cửa sổ cmd)
'  Double-click file này để bật server ở chế độ nền.
'  Log ghi vào server\jarvis.log. Dừng bằng stop-jarvis.bat.
' ============================================
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root

' Tắt instance cũ trước (ẩn, chờ xong) - dùng lại stop-jarvis.bat
sh.Run "cmd /c stop-jarvis.bat", 0, True

' Chạy server ẩn (0 = cửa sổ ẩn, False = không chờ). Output -> server\jarvis.log
sh.Run "cmd /c .venv\Scripts\python.exe server\main.py > server\jarvis.log 2>&1", 0, False
