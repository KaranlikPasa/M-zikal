Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & currentDir & "\Muzikal.bat" & chr(34), 0, False
Set WshShell = Nothing
Set fso = Nothing
