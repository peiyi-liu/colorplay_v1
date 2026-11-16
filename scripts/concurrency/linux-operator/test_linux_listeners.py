import unittest
from linux_runtime_common import validate_host_listeners

HEADER="  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"
def row(address,port,state="0A"):
    return f"0: {address}:{port:04X} 00000000:0000 {state} 00000000:00000000 00:00000000 00000000 1000 0 99\n"

class HostListenerTests(unittest.TestCase):
    def test_owned_frontend_requires_actual_loopback_listener(self):
        value=validate_host_listeners(HEADER+row("0100007F",58373)+row("00000000",22),HEADER)
        self.assertEqual(value,{"frontendLoopbackVerified":True,"observedLocalPorts":[58373]})
    def test_wildcard_or_foreign_bind_on_any_owned_port_is_refused(self):
        for address,port in [("00000000",58373),("0200007F",58373),("00000000",58322),("00000000000000000000000000000000",58373)]:
            with self.subTest(address=address,port=port),self.assertRaises(ValueError):
                validate_host_listeners(HEADER+row("0100007F",58373)+row(address,port),HEADER)
    def test_missing_frontend_and_bad_kernel_rows_fail_closed(self):
        for text in [HEADER,HEADER+row("0100007F",58373,"01"),HEADER+"malformed\n"]:
            with self.subTest(text=text),self.assertRaises(ValueError):validate_host_listeners(text,HEADER)

if __name__=="__main__":unittest.main()
