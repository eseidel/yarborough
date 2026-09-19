// The one piece of C linked in front of libz3: a do-nothing error handler.
//
// A context created by Z3_mk_context_rc starts with Z3's default error
// handler, which prints the message and calls exit(): in WebAssembly that
// aborts the whole module.  z3py installs a handler that does nothing and
// checks Z3_get_error_code after every API call; src/z3/z3.ts does the same,
// so a Z3 error becomes a JavaScript exception with Z3_get_error_msg's text.
// Installing the handler from C keeps the function table static (no
// addFunction, no ALLOW_TABLE_GROWTH).  build.sh links it with em++, which
// compiles as C++, hence the extern "C" guard on the exported name.
#include <z3.h>

#ifdef __cplusplus
extern "C" {
#endif

static void z3_wasm_ignore_error(Z3_context context, Z3_error_code code) {
  (void)context;
  (void)code;
}

void z3_wasm_install_error_handler(Z3_context context) {
  Z3_set_error_handler(context, z3_wasm_ignore_error);
}

#ifdef __cplusplus
}
#endif
