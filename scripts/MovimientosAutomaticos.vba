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
    ' La validacion de Excel puede esquivarse pegando celdas. Revisar todo el historial
    ' ANTES de compactar: si una edicion deja sin fondos una salida posterior, se deshace.
    If Not MovimientosValidos(IIf(ponerCero, Target.Row, 0), Target) Then
        Application.EnableEvents = False
        If Not ponerCero Then Application.Undo
        Application.EnableEvents = True
        MsgBox "No hay saldo suficiente en el origen en la fecha del movimiento.", vbExclamation
        Exit Sub
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

Private Function FactorDelOrigen(ByVal nombre As String) As Double
    Dim f As Long, valor As Variant
    FactorDelOrigen = 1
    For f = PRIMER_RES To ULTIMO_RES
        If StrComp(CStr(Me.Cells(f, "F").Value2), nombre, vbTextCompare) = 0 Then
            valor = Me.Cells(f, "I").Value2
            If Not IsError(valor) Then
                If IsNumeric(valor) And Len(CStr(valor)) > 0 Then
                    FactorDelOrigen = Application.Max(0, 1 + CDbl(valor))
                End If
            End If
            Exit Function
        End If
    Next f
    f = FilaCatalogo(nombre)
    If f > 0 Then
        valor = Me.Cells(f, "U").Value2
        If Not IsError(valor) Then
            If IsNumeric(valor) And Len(CStr(valor)) > 0 Then
                FactorDelOrigen = Application.Max(0, 1 + CDbl(valor))
            End If
        End If
    End If
End Function

Private Function MovimientosValidos(ByVal omitir As Long, ByVal cambiado As Range) As Boolean
    Dim f As Long, previo As Long, origen As String, destino As String
    Dim importe As Variant, fecha As Variant, ingreso As Double, retirado As Double, disponible As Double
    MovimientosValidos = False
    For f = PRIMERA To ULTIMA
        If f <> omitir Then
            importe = Me.Cells(f, "D").Value2
            If IsError(importe) Then Exit Function
            If Len(CStr(importe)) > 0 Then
                If Not IsNumeric(importe) Then Exit Function
                If CDbl(importe) < 0 Then Exit Function
                If CDbl(importe) > 0 Then
                    origen = CStr(Me.Cells(f, "B").Value2)
                    destino = CStr(Me.Cells(f, "C").Value2)
                    fecha = Me.Cells(f, "A").Value2
                    If Len(origen) = 0 Or Len(destino) = 0 Or Not IsNumeric(fecha) Then Exit Function
                    If StrComp(origen, "Exterior", vbTextCompare) <> 0 Then
                        ' Un producto historico cerrado de una exportacion antigua puede haber
                        ' realizado beneficios, pero su porcentaje anterior ya no se conoce.
                        ' No bloquear por ello la edicion de OTRO movimiento; el editado si se revisa.
                        If FilaCatalogo(origen) = 0 Then
                            If Application.CountIf(Me.Range("R6:R505"), origen) > 0 Then
                                If Intersect(cambiado, Me.Range("A" & f & ":D" & f)) Is Nothing Then GoTo SiguienteMovimiento
                            End If
                        End If
                        ingreso = 0
                        retirado = 0
                        For previo = PRIMERA To f - 1
                            If previo <> omitir Then
                                If IsNumeric(Me.Cells(previo, "A").Value2) Then
                                    If CDbl(Me.Cells(previo, "A").Value2) <= CDbl(fecha) Then
                                        If IsNumeric(Me.Cells(previo, "D").Value2) Then
                                            If StrComp(CStr(Me.Cells(previo, "C").Value2), origen, vbTextCompare) = 0 Then
                                                ingreso = ingreso + CDbl(Me.Cells(previo, "D").Value2)
                                            End If
                                            If StrComp(CStr(Me.Cells(previo, "B").Value2), origen, vbTextCompare) = 0 Then
                                                retirado = retirado + CDbl(Me.Cells(previo, "D").Value2)
                                            End If
                                        End If
                                    End If
                                End If
                            End If
                        Next previo
                        disponible = Application.WorksheetFunction.Round(ingreso * FactorDelOrigen(origen) - retirado, 2)
                        If CDbl(importe) > disponible + 0.000001 Then Exit Function
                    End If
                End If
            End If
        End If
SiguienteMovimiento:
    Next f
    MovimientosValidos = True
End Function

' En S:V hay una fila fija por nombre. El orden del catalogo conserva los fondos ya existentes;
' los nuevos se incorporan al escribirlos en De/A. Solo salen los nombres con saldo o cuenta
' con movimientos. F:K siempre ocupa las mismas filas para no romper los totales ni los graficos.
Private Sub ReordenarResumen()
    Dim f As Long, m As Long, dst As Long, n As String, r As Long
    Dim entradas As Double, salidas As Double, multiplicador As Double
    Dim cuenta As Boolean, sinImporte As Boolean, valorPct As Variant
    Dim nombres(1 To 500) As String, num As Long, candidatos As Variant, candidato As Variant
    Dim q As String, factor As String, ingreso As String, retirada As String, saldo As String
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
        valorPct = Me.Cells(r, "U").Value2
        multiplicador = 1
        If Not IsError(valorPct) Then
            If IsNumeric(valorPct) And Len(CStr(valorPct)) > 0 Then multiplicador = Application.Max(0, 1 + CDbl(valorPct))
        End If
        sinImporte = Application.CountIfs(Me.Range("C6:C505"), n, Me.Range("D6:D505"), "") > 0
        sinImporte = sinImporte Or Application.CountIfs(Me.Range("B6:B505"), n, Me.Range("D6:D505"), "") > 0
        If (cuenta And entradas + salidas > 0) Or (Not cuenta And (entradas * multiplicador - salidas > 0.005 Or sinImporte)) Then
            num = num + 1
            nombres(num) = n
        End If
    Next r
    If num > ULTIMO_RES - PRIMER_RES + 1 Then
        MsgBox "Hay mas inversiones que filas de resumen. Descarga un libro con mas plazas.", vbExclamation
        Exit Sub
    End If
    ' Los valores editables quedan vinculados al nombre en S:U, no a su posicion antigua.
    q = Chr(34)
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
        ' Las retiradas agotan primero el principal (H); los intereses no se esfuman.
        ' El saldo K sigue disponible aun cuando H ya sea cero y quede beneficio por sacar.
        factor = "MAX(0,IFERROR(1+I" & dst & ",1))"
        ingreso = "SUMIFS($D$6:$D$505,$C$6:$C$505,F" & dst & ")"
        retirada = "SUMIFS($D$6:$D$505,$B$6:$B$505,F" & dst & ")"
        saldo = ingreso & "*" & factor & "-" & retirada
        Me.Cells(dst, "H").Formula = "=IFERROR(IF(F" & dst & "=" & q & q & "," & q & q & _
            ",IF((" & saldo & ")<=0.005," & q & q & ",MAX(0," & ingreso & "-" & retirada & ")))," & q & q & ")"
        Me.Cells(dst, "K").Formula = "=IFERROR(IF(F" & dst & "=" & q & q & "," & q & q & _
            ",IF((" & saldo & ")<=0.005," & q & q & ",ROUND(MAX(0," & saldo & "),2)))," & q & q & ")"
        Me.Cells(dst, "J").Formula = "=IFERROR(IF(OR(F" & dst & "=" & q & q & ",K" & dst & "=" & q & q & _
            ")," & q & q & ",K" & dst & "-H" & dst & ")," & q & q & ")"
    Next dst
    Me.Calculate
End Sub
