"""Regenera src/lib/vbaProject.bin a partir del VBA auditable del repositorio.

Requiere pyopenvba: python -m pip install pyopenvba. No usa datos del usuario.
El archivo .bin se distribuye para que el navegador pueda crear el .xlsm sin un servidor.
"""
from pathlib import Path
from zipfile import ZipFile
from tempfile import TemporaryDirectory
from pyopenvba import ExcelFile, VBAModuleKind

ROOT = Path(__file__).resolve().parents[1]
with TemporaryDirectory() as folder:
    seed = Path(folder) / 'seed.xlsm'
    with ExcelFile.create_new(seed) as wb:
        wb.set_module('Sheet1', (ROOT / 'scripts/MovimientosAutomaticos.vba').read_text())
        wb.set_module('ThisWorkbook', (ROOT / 'scripts/ThisWorkbook.vba').read_text())
        header = wb.vba_project().get_module('Sheet1').attribute_header.replace('Sheet1', 'Sheet2')
        wb.vba_project().add_module('Sheet2', header, kind=VBAModuleKind.other)
        wb.save()
    with ZipFile(seed) as zipfile:
        data = zipfile.read('xl/vbaProject.bin')
    (ROOT / 'src/lib/vbaProject.bin').write_bytes(data)
    with ExcelFile(seed) as wb:
        for modulo, archivo in [('Sheet1', 'MovimientosAutomaticos.vba'),
                                ('ThisWorkbook', 'ThisWorkbook.vba')]:
            original = (ROOT / 'scripts' / archivo).read_text().replace('\r\n', '\n').strip()
            extraido = wb.get_module(modulo).replace('\r\n', '\n')
            assert original in extraido, f'El proyecto VBA no contiene {archivo} completo'
        assert 'Sheet2' in wb.module_names()
print('VBA generado y verificado:', len(data), 'bytes')
