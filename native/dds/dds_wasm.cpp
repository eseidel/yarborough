// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// The two double-dummy calls the site needs, as plain C functions over Bo
// Haglund's DDS (Apache-2.0, https://github.com/dds-bridge/dds).  Built to
// WebAssembly by build.sh; the TypeScript side is src/dds/dds.ts.
//
// Encodings are DDS's own: suits 0=S 1=H 2=D 3=C (trump 4=NT), hands
// 0=N 1=E 2=S 3=W, ranks 2..14.

#include <emscripten.h>
#include <cstdio>
#include <cstring>

#include "dll.h"

static bool initialized = false;

static void ensure_initialized() {
  if (initialized) return;
  // One thread and a bounded transposition table: this runs inside a browser
  // worker next to Pyodide.
  SetResources(64, 1);
  initialized = true;
}

extern "C" {

// DDS's own version, "2.9.0" style.
EMSCRIPTEN_KEEPALIVE const char* dds_version() {
  static char out[32];
  int major = 0, minor = 0, patch = 0;


  DDSInfo info;
  GetDDSInfo(&info);
  major = info.major;
  minor = info.minor;
  patch = info.patch;
  snprintf(out, sizeof out, "%d.%d.%d", major, minor, patch);

  return out;
}

// The full double-dummy table for a PBN deal ("N:AKQ.J... ..."): twenty
// trick counts as a comma-separated string, strains S,H,D,C,NT outermost and
// declarers N,E,S,W innermost.  On failure "error <code>: <message>".
EMSCRIPTEN_KEEPALIVE const char* dds_calc_table(const char* pbn) {
  static char out[256];
  ensure_initialized();
  ddTableDealPBN deal;
  strncpy(deal.cards, pbn, sizeof deal.cards - 1);
  deal.cards[sizeof deal.cards - 1] = '\0';
  ddTableResults table;
  int code = CalcDDtablePBN(deal, &table);
  if (code != RETURN_NO_FAULT) {
    char message[80];
    ErrorMessage(code, message);
    snprintf(out, sizeof out, "error %d: %s", code, message);
    return out;
  }
  int n = 0;
  for (int strain = 0; strain < DDS_STRAINS; strain++) {
    for (int hand = 0; hand < DDS_HANDS; hand++) {
      n += snprintf(out + n, sizeof out - n, "%s%d", (strain || hand) ? "," : "",
                    table.resTable[strain][hand]);
    }
  }
  return out;
}

// Declarer's tricks when the opening lead is fixed and both sides play
// double-dummy from the second card on.  `pbn` holds the 51 cards still in
// hand (the led card removed), `leader` the hand that led, and the led card
// is (lead_suit, lead_rank).  A negative result is minus the DDS error code.
EMSCRIPTEN_KEEPALIVE int dds_solve_after_lead(const char* pbn, int trump, int leader,
                                              int lead_suit, int lead_rank) {
  ensure_initialized();
  dealPBN deal;
  deal.trump = trump;
  deal.first = leader;
  deal.currentTrickSuit[0] = lead_suit;
  deal.currentTrickRank[0] = lead_rank;
  for (int i = 1; i < 3; i++) {
    deal.currentTrickSuit[i] = 0;
    deal.currentTrickRank[i] = 0;
  }
  strncpy(deal.remainCards, pbn, sizeof deal.remainCards - 1);
  deal.remainCards[sizeof deal.remainCards - 1] = '\0';
  futureTricks future;
  // target -1, solutions 1: the best score for the side now on play, which
  // after the lead is declarer's side (dummy plays second).  Mode 1, not 0:
  // mode 0 skips the search when that hand has a single legal card (a
  // singleton it must follow with) and reports -2 instead of a trick count.
  int code = SolveBoardPBN(deal, -1, 1, 1, &future, 0);
  if (code != RETURN_NO_FAULT) return -code;
  return future.score[0];
}

}  // extern "C"
