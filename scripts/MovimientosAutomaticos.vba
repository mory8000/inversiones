' Modulo de la hoja Sheet1 (Movimientos). Los cambios se hacen solo dentro del libro.
' El catalogo oculto S:V guarda nombre, titular, porcentaje y tipo por producto.
Option Explicit

Private Const PRIMERA As Long = 6
Private Const ULTIMA As Long = 505
Private Const PRIMER_RES As Long = 7
Private Function ULTIMO_RES() As Long
    ULTIMO_RES = CLng(Me.Range("W6").Value2)
End Function

Private Function PRIMER_TITULAR() As String
    PRIMER_TITULAR = CStr(Me.Range("W8").Value2)
End Function

Private Sub Worksheet_Change(ByVal Target As Range)
    Dim antes As Variant, ponerCero As Boolean
    Dim numero As Double
    If Intersect(Target, Me.Range("A6:D505,G7:G" & ULTIMO_RES & ",I7:I" & ULTIMO_RES)) Is Nothing Then Exit Sub
    On Error GoTo Fallo
    ' Undo solo para una edicion de D de un numero positivo a cero.
    If Target.CountLarge = 1 Then
        If Target.Column = 4 And Target.Row >= PRIMERA And Target.Row <= ULTIMA Then
            If Not IsError(Target.Value2) Then
                If IsNumeric(Target.Value2) And Len(CStr(Target.Value2)) > 0 Then
                    If CDbl(Target.Value2) = 0 Then
                        Application.EnableEvents = False
                        Application.Undo
                        antes = Target.Value2
                        ponerCero = False
                        If Not IsError(antes) Then
                            If IsNumeric(antes) And Len(CStr(antes)) > 0 Then
                                numero = CDbl(antes)
                                ponerCero = (numero > 0)
                            End If
                        End If
                        If Not ponerCero Then Target.Value2 = 0
                        Application.EnableEvents = True
                    End If
                End If
            End If
        End If
    End If
    Application.EnableEvents = False
    Me.Unprotect Password:=""
    If ponerCero Then Me.Range("B" & Target.Row & ":D" & Target.Row).ClearContents
    If Not Intersect(Target, Me.Range("G7:G" & ULTIMO_RES & ",I7:I" & ULTIMO_RES)) Is Nothing Then
        GuardarEdicionResumen Target
    End If
    If ponerCero Or Not Intersect(Target, Me.Range("B6:D505")) Is Nothing Then
        CompactarMovimientos
    End If
    ReordenarResumen
Salir:
    Me.Protect Password:="", AllowFormattingCells:=True, AllowFormattingRows:=True, _
        AllowInsertingRows:=True, AllowDeletingRows:=True
    Application.EnableEvents = True
    Exit Sub
Fallo:
    MsgBox "No se pudo actualizar Movimientos: " & Err.Description, vbExclamation
    Resume Salir
End Sub

' Tambien llamado al abrir el libro: actualiza el resumen con movimientos existentes.
Public Sub ActualizarMovimientos()
    On Error GoTo Fallo
    Application.EnableEvents = False
    Me.Unprotect Password:=""
    CompactarMovimientos
    ReordenarResumen
Salir:
    Me.Protect Password:="", AllowFormattingCells:=True, AllowFormattingRows:=True, _
        AllowInsertingRows:=True, AllowDeletingRows:=True
    Application.EnableEvents = True
    Exit Sub
Fallo:
    MsgBox "No se pudo actualizar Movimientos: " & Err.Description, vbExclamation
    Resume Salir
End Sub

Private Function FilaCatalogo(ByVal nombre As String) As Long
    Dim f As Long
    If Len(nombre) = 0 Or nombre = "Exterior" Then Exit Function
    For f = PRIMERA To ULTIMA
        If StrComp(CStr(Me.Cells(f, "S").Value2), nombre, vbTextCompare) = 0 Then
            FilaCatalogo = f
            Exit Function
        End If
        If Len(CStr(Me.Cells(f, "S").Value2)) = 0 Then Exit For
    Next f
End Function

Private Sub GuardarEdicionResumen(ByVal Target As Range)
    Dim celda As Range, catalogo As Long, nombre As String
    For Each celda In Target.Cells
        If celda.Row >= PRIMER_RES And celda.Row <= ULTIMO_RES Then
            If celda.Column = 7 Or celda.Column = 9 Then
                nombre = CStr(Me.Cells(celda.Row, "F").Value2)
                catalogo = FilaCatalogo(nombre)
                If catalogo > 0 Then
                    If celda.Column = 7 Then
                        Me.Cells(catalogo, "T").Value2 = celda.Value2
                    Else
                        Me.Cells(catalogo, "U").Value2 = celda.Value2
                    End If
                End If
            End If
        End If
    Next celda
End Sub

' No borrar filas de Excel: hay graficos y referencias a los totales debajo.
' Solo se compactan las cuatro celdas de los movimientos; las fechas viajan con su movimiento.
Private Sub CompactarMovimientos()
    Dim src As Long, dst As Long, fecha As Variant, orig As Variant, dest As Variant, importe As Variant
    dst = PRIMERA
    For src = PRIMERA To ULTIMA
        orig = Me.Cells(src, "B").Value2
        dest = Me.Cells(src, "C").Value2
        importe = Me.Cells(src, "D").Value2
        If Len(CStr(orig)) > 0 Or Len(CStr(dest)) > 0 Or Len(CStr(importe)) > 0 Then
            If src <> dst Then
                fecha = Me.Cells(src, "A").Value2
                Me.Cells(dst, "A").Value2 = fecha
                Me.Cells(dst, "B").Value2 = orig
                Me.Cells(dst, "C").Value2 = dest
                Me.Cells(dst, "D").Value2 = importe
            End If
            dst = dst + 1
        End If
    Next src
    If dst <= ULTIMA Then
        Me.Range("A" & dst & ":D" & ULTIMA).ClearContents
        Me.Cells(dst, "A").Value = Date
        Me.Cells(dst, "A").NumberFormat = "dd/mm/yyyy"
    End If
End Sub

' Devuelve el titular del origen de un ingreso a una inversion nueva.
Private Function TitularOrigen(ByVal nombre As String) As String
    Dim f As Long, registro As Long
    For f = PRIMERA To ULTIMA
        If StrComp(CStr(Me.Cells(f, "C").Value2), nombre, vbTextCompare) = 0 Then
            registro = FilaCatalogo(CStr(Me.Cells(f, "B").Value2))
            If registro > 0 Then
                TitularOrigen = CStr(Me.Cells(registro, "T").Value2)
                If Len(TitularOrigen) > 0 Then Exit Function
            End If
        End If
    Next f
    TitularOrigen = PRIMER_TITULAR
End Function

' En S:V hay una fila fija por nombre. El orden del catalogo conserva los fondos ya existentes;
' los nuevos se incorporan al escribirlos en De/A. Solo salen los nombres con saldo o cuenta
' con movimientos. F:K siempre ocupa las mismas filas para no romper los totales ni los graficos.
Private Sub ReordenarResumen()
    Dim f As Long, m As Long, dst As Long, n As String, r As Long
    Dim entradas As Double, salidas As Double, cuenta As Boolean, sinImporte As Boolean
    Dim nombres(1 To 500) As String, num As Long, candidatos As Variant, candidato As Variant
    ' Las altas nuevas vienen de las columnas editables, no de una lista adicional visible.
    For m = PRIMERA To ULTIMA
        candidatos = Array(Me.Cells(m, "B").Value2, Me.Cells(m, "C").Value2)
        For Each candidato In candidatos
            If Not IsError(candidato) Then
                n = Trim(CStr(candidato))
                If Len(n) > 0 And n <> "Exterior" And FilaCatalogo(n) = 0 Then
                    For r = PRIMERA To ULTIMA
                        If Len(CStr(Me.Cells(r, "S").Value2)) = 0 Then Exit For
                    Next r
                    If r <= ULTIMA Then
                        Me.Cells(r, "S").Value2 = n
                        Me.Cells(r, "T").Value2 = TitularOrigen(n)
                        Me.Cells(r, "V").Value2 = "inversion"
                    End If
                End If
            End If
        Next candidato
    Next m
    num = 0
    For r = PRIMERA To ULTIMA
        n = CStr(Me.Cells(r, "S").Value2)
        If Len(n) = 0 Then Exit For
        entradas = Application.SumIfs(Me.Range("D6:D505"), Me.Range("C6:C505"), n)
        salidas = Application.SumIfs(Me.Range("D6:D505"), Me.Range("B6:B505"), n)
        cuenta = (CStr(Me.Cells(r, "V").Value2) = "cuenta")
        sinImporte = Application.CountIfs(Me.Range("C6:C505"), n, Me.Range("D6:D505"), "") > 0
        sinImporte = sinImporte Or Application.CountIfs(Me.Range("B6:B505"), n, Me.Range("D6:D505"), "") > 0
        If (cuenta And entradas + salidas > 0) Or (Not cuenta And (entradas - salidas > 0.005 Or sinImporte)) Then
            num = num + 1
            nombres(num) = n
        End If
    Next r
    If num > ULTIMO_RES - PRIMER_RES + 1 Then
        MsgBox "Hay mas inversiones que filas de resumen. Descarga un libro con mas plazas.", vbExclamation
        Exit Sub
    End If
    ' Los valores editables quedan vinculados al nombre en S:U, no a su posicion antigua.
    For dst = PRIMER_RES To ULTIMO_RES
        n = ""
        If dst - PRIMER_RES + 1 <= num Then n = nombres(dst - PRIMER_RES + 1)
        Me.Cells(dst, "F").Value2 = n
        If Len(n) = 0 Then
            Me.Cells(dst, "G").ClearContents
            Me.Cells(dst, "I").ClearContents
        Else
            r = FilaCatalogo(n)
            Me.Cells(dst, "G").Value2 = Me.Cells(r, "T").Value2
            Me.Cells(dst, "I").Value2 = Me.Cells(r, "U").Value2
        End If
        ' Reescribir las formulas por nombre de fila: ninguna queda atada al producto
        ' anterior si se desplazan las inversiones del resumen.
        Me.Cells(dst, "H").Formula = "=IFERROR(IF(F" & dst & "="""","""",SUMIFS($D$6:$D$505,$C$6:$C$505,F" & dst & ")-SUMIFS($D$6:$D$505,$B$6:$B$505,F" & dst & ")),"""")"
        Me.Cells(dst, "K").Formula = "=IFERROR(IF(OR(F" & dst & "="""",H" & dst & "="""",H" & dst & "=0),"""",IF(I" & dst & "="""",H" & dst & ",H" & dst & "*(1+I" & dst & "))),"""")"
        Me.Cells(dst, "J").Formula = "=IFERROR(IF(OR(F" & dst & "="""",K" & dst & "=""""),"""",K" & dst & "-H" & dst & "),"""")"
    Next dst
    Me.Calculate
End Sub
