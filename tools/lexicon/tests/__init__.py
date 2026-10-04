"""單元測試的共同安全設定：不連網、不需要金鑰、快取放在暫存資料夾。

unittest 以 `-t tools/lexicon` 探索測試時，這個檔案會在每個測試模組之前先被載入。
"""
import os
import socket
import tempfile

_LOCAL_HOSTS = ('127.0.0.1', '::1', 'localhost')
_real_connect = socket.socket.connect
_real_create_connection = socket.create_connection


def _host_of(address):
    if isinstance(address, tuple) and address:
        return address[0]
    return address


def _guard_connect(self, address):
    # 只放行本機（之後 06-07 的假伺服器會用到 127.0.0.1）
    if _host_of(address) not in _LOCAL_HOSTS:
        raise RuntimeError('單元測試不可連網：' + str(address))
    return _real_connect(self, address)


def _guard_create_connection(address, *args, **kwargs):
    if _host_of(address) not in _LOCAL_HOSTS:
        raise RuntimeError('單元測試不可連網：' + str(address))
    return _real_create_connection(address, *args, **kwargs)


socket.socket.connect = _guard_connect
socket.create_connection = _guard_create_connection

# 快取一律指向全新的暫存資料夾，絕不碰使用者真正的快取
if not os.environ.get('LEX_CACHE_DIR'):
    os.environ['LEX_CACHE_DIR'] = tempfile.mkdtemp(prefix='lex-test-cache-')

# 測試不需要也不可以使用 AI 金鑰
os.environ.pop('GEMINI_API_KEY', None)
os.environ.pop('LEX_AI_URL', None)
