' Copiar este código en el módulo de la HOJA «Movimientos» de Excel (no en un módulo general).
' Guardar después como libro habilitado para macros (*.xlsm) y permitir macros al abrir.
' Solo reacciona si se cambia UNA celda de Importe, de un número positivo a 0.
' Si la celda ya era cero, estaba vacía o se pegan varias filas, no elimina nada.
Private Sub Worksheet_Change(ByVal Target As Range)
    Dim anterior As Variant
    If Target.CountLarge <> 1 Then Exit Sub
    If Intersect(Target, Me.Range("D6:D505")) Is Nothing Then Exit Sub
    If IsError(Target.Value2) Then Exit Sub
    If Not IsNumeric(Target.Value2) Then Exit Sub
    If CDbl(Target.Value2) <> 0 Then Exit Sub

    On Error GoTo Terminar
    Application.EnableEvents = False
    Application.Undo                 ' Recupera el valor que había antes de escribir 0.
    anterior = Target.Value2

    If Not IsError(anterior) Then
        If IsNumeric(anterior) Then
            If CDbl(anterior) > 0 Then
                Me.Range("B" & Target.Row & ":D" & Target.Row).ClearContents
                Me.Cells(Target.Row, "A").Value = Date
                Me.Cells(Target.Row, "A").NumberFormat = "dd/mm/yyyy"
                GoTo Terminar
            End If
        End If
    End If
    Target.Value2 = 0                ' No era positivo: conserva el 0 original.
Terminar:
    Application.EnableEvents = True
End Sub
