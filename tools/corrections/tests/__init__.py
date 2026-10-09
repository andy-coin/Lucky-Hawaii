"""單元測試的共同安全設定：不連網（只准連本機）、不需要金鑰。

unittest 以 `-t tools/corrections` 探索測試時，這個檔案會在每個測試模組之前先被載入。
"""
import os
import socket

_LOCAL_HOSTS = ('127.0.0.1', '::1', 'localhost')
_real_connect = socket.socket.connect
_real_create_connection = socket.create_connection


def _host_of(address):
    if isinstance(address, tuple) and address:
        return address[0]
    return address


def _guard_connect(self, address):
    # 只放行本機（假 Worker 與本機 bare repo 用 127.0.0.1）
    if _host_of(address) not in _LOCAL_HOSTS:
        raise RuntimeError('單元測試不可連網：' + str(address))
    return _real_connect(self, address)


def _guard_create_connection(address, *args, **kwargs):
    if _host_of(address) not in _LOCAL_HOSTS:
        raise RuntimeError('單元測試不可連網：' + str(address))
    return _real_create_connection(address, *args, **kwargs)


socket.socket.connect = _guard_connect
socket.create_connection = _guard_create_connection

# 測試不可以拿到真正的後台金鑰；需要金鑰的測試自己用假的
os.environ.pop('LH_ADMIN_KEY', None)
