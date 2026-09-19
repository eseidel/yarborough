# cspell:ignore sexpr subterms undominated competative chunksize
# Copyright (c) 2026 The Yarborough Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Export the Python engine's observable behavior as fixtures for the TypeScript port.

    python -m tests.export_fixtures [--out DIR] [--check] [--deals N] [--seed S]
                                    [--limit N] [--jobs N]

Writes tests/engine-fixtures/ at the repository root (docs/typescript-engine-plan.md,
"Fixtures").  Everything is generated: never edit the files by hand.  --check regenerates
into a temporary directory and diffs against the committed files (exit 1 on any difference).
The output is deterministic: keys are sorted, calls are in Call order, rules by name, suits by
index, enum values by index; nothing depends on Python set order or PYTHONHASHSEED.

Files (schemas in the docstring of each writer below):

    rules-manifest.json      every compiled rule, sorted by name
    vocabulary.json          purposes, annotations, categories, positions, strains, calls
    categories.json          the category table and role_for over sample auctions
    model-expressions.json   printed forms (sexpr) of the hand model
    auction-snapshots.jsonl  the state of History over every auction the corpus visits
    meanings.jsonl           per snapshot, per call: priorities and meaning hashes
    meanings-sample.jsonl    the same for the first 40 auctions, with the full text
    decisions.jsonl          per corpus expectation: possible calls, maximal set, choice
    interpretations.jsonl    per snapshot: yarborough_z3b.get_call_interpretations
    random-deals.jsonl       seeded random deals bid to completion, with the opening lead
    core-cases.json          cases for the core types and the lead chooser

Printed forms are z3's sexpr() with the aliasing of shared subterms turned off
(pp.min_alias_size, so no `let`) and runs of whitespace collapsed to one space (z3 wraps
long lines; the structure is what matters).  Nested associative operators print flat
(pp.flat_assoc, z3's default): `a + b + c` is `(+ a b c)`.  Hashes are the first 16 hex
characters of the sha256 of that text.
"""

import argparse
import contextlib
import difflib
import hashlib
import io
import itertools
import json
import multiprocessing
import os
import random
import sys
import tempfile
import time
import traceback

import z3

import categories
import leads
import yarborough_z3b as api
from core import suit
from core.board import Board
from core.call import Call, Pass
from core.callexplorer import CallExplorer
from core.callhistory import CallHistory, Vulnerability
from core.deal import Deal
from core.hand import Hand
from core.position import POSITIONS, Position
from z3b import model, prefer, purposes
from z3b.bidder import Bidder, Interpreter, RuleSelector
from z3b.constraints import Constraint
from z3b.enum import Enum
from z3b.forcing import SAYCForcingOracle
from z3b.model import positions
from z3b.preconditions import Precondition, annotations, implies_artificial
from z3b.rule_compiler import Rule, RuleCompiler, categories as rule_categories
from tests import harness, test_sayc_data

# The printed forms must be a function of the expression tree alone: no `let` aliases for
# shared subterms, and no depth limit.
z3.set_param("pp.min_alias_size", 1000000)
z3.set_param("pp.max_depth", 1000000)

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_OUT = os.path.join(REPO, "tests", "engine-fixtures")
DEFAULT_DEALS = 300
DEFAULT_SEED = 20260919
SAMPLE_AUCTIONS = 40
POINT_THRESHOLDS = (10, 13, 16, 19, 22, 25)
CORE_BOARDS = 30
LEAD_CASES = 40

FILES = (
    "rules-manifest.json",
    "vocabulary.json",
    "categories.json",
    "model-expressions.json",
    "auction-snapshots.jsonl",
    "meanings.jsonl",
    "meanings-sample.jsonl",
    "decisions.jsonl",
    "interpretations.jsonl",
    "random-deals.jsonl",
    "core-cases.json",
)

ALL_CALL_NAMES = ["P", "X", "XX"] + ["%s%s" % (level, strain.char)
                                     for level in Call.LEVELS for strain in suit.STRAINS]


# --- helpers ------------------------------------------------------------------------------

def _log(message):
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


@contextlib.contextmanager
def _silenced():
    """The bidder prints WARNING and COLLISION lines; keep them out of the export."""
    with contextlib.redirect_stdout(io.StringIO()) as captured:
        yield captured


def _hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _sexpr(expr):
    """The printed form of a z3 expression, whitespace collapsed."""
    text = " ".join(expr.sexpr().split())
    assert "(let " not in text and "..." not in text, "the printer aliased or truncated: %s" % text[:200]
    return text


def _call_name(call):
    return call.name if call is not None else None


def _sorted_call_names(calls):
    return [call.name for call in sorted(calls)]


def _enum_keys(values):
    return [value.key for value in sorted(values, key=lambda value: value.index)]


def _suit_chars(suits):
    return [s.char for s in sorted(suits, key=lambda s: s.index)]


def _rule_name(rule):
    return rule.name if rule is not None else None


def _position_key(position):
    return position.key if position is not None else None


def _last_line(exc):
    return traceback.format_exception_only(type(exc), exc)[-1].strip()


def describe(value):
    """A JSON description of a DSL value: constraints, preconditions, z3 expressions, enum
    values, strains, calls, and containers of those."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, z3.ExprRef):
        return {"z3": _sexpr(value)}
    if isinstance(value, Enum.EnumValue):
        return {"enum": value.key}
    if isinstance(value, suit.Strain):
        return {"strain": value.char}
    if isinstance(value, Call):
        return {"call": value.name}
    if isinstance(value, Position):
        return {"position": value.char}
    if isinstance(value, Precondition):
        return {"precondition": repr(value)}
    if isinstance(value, prefer.Entry):
        return _describe_prefer_entry(value)
    if isinstance(value, Constraint):
        described = {"constraint": value.__class__.__name__}
        for name, attribute in sorted(vars(value).items()):
            described[name] = describe(attribute)
        return described
    if callable(value):
        return {"callable": getattr(value, "__name__", repr(value))}
    if isinstance(value, dict):
        return {str(key): describe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        items = list(value)
        if isinstance(value, (set, frozenset)):
            items = sorted(items, key=repr)
        return [describe(item) for item in items]
    return {"repr": repr(value)}


def _describe_prefer_entry(entry):
    described = {
        "type": entry.__class__.__name__,
        "names": list(entry.names),
        "conditional": bool(entry.conditional),
    }
    if isinstance(entry, prefer.Conditional):
        described["order"] = entry._order.__class__.__name__
        described["condition"] = describe(entry._condition)
    return described


def _describe_purpose(purpose):
    if purpose is None:
        return None
    if callable(purpose) and not isinstance(purpose, str):
        return "callable:%s" % purpose.__name__
    return purpose


def _describe_conditional_purpose(entry):
    return {
        "condition": describe(entry[0]),
        "purpose": _describe_purpose(entry[1]),
        "base": _describe_purpose(entry[2]) if len(entry) > 2 else None,
    }


def _per_call(flattened, describe_value):
    """A tuple-key-flattened per-call dict, keyed by call name in Call order."""
    return {call.name: describe_value(flattened[call.name])
            for call in sorted(Call.from_string(name) for name in flattened)}


# --- rules-manifest.json ------------------------------------------------------------------

def rules_manifest(system):
    """[{name, mro, category, purpose, purposes_per_call, conditional_purposes,
    conditional_purposes_per_call, known_calls, annotations, annotations_per_call,
    annotations_for_call, fallback, requires_planning, forcing, explanation,
    explanations_per_call, preconditions, preconditions_per_call, prefer, shared_constraints,
    constraints}], sorted by name.  Purposes are strings, or "callable:<name>".  Prefer is the
    normalized entry list (z3b.prefer._normalize).  mro is every class in the rule's MRO but
    object, most derived first (mixins that are not Rules contribute DSL fields too)."""
    manifest = []
    for rule in sorted(system.rules, key=lambda rule: rule.name):
        dsl = rule.dsl_rule
        manifest.append({
            "name": rule.name,
            "mro": [cls.__name__ for cls in dsl.__mro__ if cls is not object],
            "category": dsl.category.key,
            "purpose": _describe_purpose(dsl.purpose),
            "purposes_per_call": _per_call(rule.purposes_per_call, _describe_purpose),
            "conditional_purposes": [_describe_conditional_purpose(entry) for entry in dsl.conditional_purposes],
            "conditional_purposes_per_call": _per_call(
                rule.conditional_purposes_per_call,
                lambda entries: [_describe_conditional_purpose(entry) for entry in entries]),
            "known_calls": _sorted_call_names(rule.known_calls),
            "annotations": _enum_keys(rule._annotations),
            "annotations_per_call": _per_call(
                RuleCompiler._flatten_tuple_keyed_dict(dsl.annotations_per_call),
                lambda value: _enum_keys(RuleCompiler._ensure_list(value))),
            "annotations_for_call": {call.name: _enum_keys(rule.annotations_for_call(call))
                                     for call in sorted(rule.known_calls)},
            "fallback": int(dsl.fallback),
            "requires_planning": bool(rule.requires_planning),
            "forcing": rule.forcing,
            "explanation": dsl.explanation,
            "explanations_per_call": _per_call(
                RuleCompiler._flatten_tuple_keyed_dict(dsl.explanations_per_call), lambda value: value),
            "preconditions": [repr(precondition) for precondition in rule.preconditions],
            "preconditions_per_call": _per_call(
                rule.preconditions_per_call,
                lambda value: [repr(precondition) for precondition in RuleCompiler._ensure_list(value)]),
            "prefer": [_describe_prefer_entry(entry) for entry in prefer._normalize(dsl.prefer or [])],
            "shared_constraints": describe(rule.shared_constraints),
            "constraints": _per_call(rule.constraints, describe),
        })
    return manifest


# --- vocabulary.json ----------------------------------------------------------------------

def vocabulary():
    """{purposes: {ORDER, RANK, BY_SUIT, PREFERENCES, CONDITIONS}, annotations, implies_artificial,
    rule_categories, positions, strains, suits, calls, categories: {LEVEL_ONE, PASSING, NATURAL,
    CONTEXTUAL}, points_tables}."""
    from z3b import natural
    return {
        "purposes": {
            "ORDER": list(purposes.ORDER),
            "RANK": dict(purposes.RANK),
            "BY_SUIT": {key: list(value) for key, value in purposes.BY_SUIT.items()},
            "PREFERENCES": {key: [[strains, condition] for strains, condition in value]
                            for key, value in purposes.PREFERENCES.items()},
            "CONDITIONS": {key: describe(value) for key, value in sorted(purposes.CONDITIONS.items())},
        },
        "annotations": [value.key for value in annotations],
        "implies_artificial": _enum_keys(implies_artificial),
        "rule_categories": [value.key for value in rule_categories],
        "positions": [value.key for value in positions],
        "strains": [strain.char for strain in suit.STRAINS],
        "strain_names": list(suit.Strain.ALL_NAMES),
        "suits": [s.char for s in suit.SUITS],
        "majors": [s.char for s in suit.MAJORS],
        "minors": [s.char for s in suit.MINORS],
        "calls": ALL_CALL_NAMES,
        "levels": list(Call.LEVELS),
        "categories": {
            "LEVEL_ONE": list(categories.LEVEL_ONE),
            "PASSING": categories.PASSING,
            "NATURAL": categories.NATURAL,
            "CONTEXTUAL": dict(categories._CONTEXTUAL),
        },
        "points_tables": {
            "suited": natural.points_for_sound_suited_bid_at_level,
            "notrump": natural.points_for_sound_notrump_bid_at_level,
            "min_hcp_for_open": model.min_hcp_for_open,
        },
        "rule_allowed_keys": sorted(Rule.ALLOWED_KEYS),
    }


# --- categories.json ----------------------------------------------------------------------

ROLE_AUCTIONS = [
    ("", "N"), ("P", "N"), ("1S", "N"), ("1S P", "N"), ("P 1H", "E"), ("1H 1S", "N"),
    ("1S P 2S", "N"), ("P P 1N X", "S"), ("1C P 1H P", "N"), ("1H 2C P P", "W"),
    ("1N P 2C P 2D P", "N"), ("P P P 1S P 2S P", "E"), ("1S X P P", "N"), ("1S X XX 2H", "W"),
    ("P P", "S"), ("1D 1H X 2H P P", "N"),
]


def categories_fixture(rule_names):
    """{rules: {name: {formatted, level_one, level_two, contextual}}, known_rule_names,
    roles: [{calls, dealer, role, pass_category, natural_category}]}.  A contextual rule has
    no fixed level one: category_for takes it from the auction."""
    rules = {}
    for name in sorted(rule_names):
        entry = {"formatted": categories.format_rule_name(name)}
        if name in categories._TABLE:
            entry["level_one"], entry["level_two"] = categories._TABLE[name]
            entry["contextual"] = False
        else:
            entry["level_one"] = None
            entry["level_two"] = categories._CONTEXTUAL[name]
            entry["contextual"] = True
        rules[name] = entry
    roles = []
    for calls, dealer in ROLE_AUCTIONS:
        history = CallHistory.from_string(calls, dealer, "None")
        roles.append({
            "calls": calls,
            "dealer": dealer,
            "role": categories.role_for(history),
            "pass_category": categories.category_for(None, history),
            "natural_category": categories.category_for("NaturalSuited", history),
        })
    return {"rules": rules, "known_rule_names": sorted(categories.known_rule_names()), "roles": roles}


# --- model-expressions.json ---------------------------------------------------------------

SAMPLE_HANDS = ["KQ4.AQ8.K9873.K2", "AKT92.T98.AQ9.AT", "832.A.QJ652.JT73"]


def model_expressions():
    """{axioms: [sexpr], named: {name: sexpr} for every z3 expression at module level of
    model.py, hands: {cdhs: sexpr of expr_for_hand}, by_suit: {helper: {suit: name}}}."""
    named = {name: _sexpr(value) for name, value in vars(model).items() if isinstance(value, z3.ExprRef)}
    return {
        "axioms": [_sexpr(axiom) for axiom in model.axioms],
        "named": dict(sorted(named.items())),
        "hands": {hand: _sexpr(model.expr_for_hand(Hand.from_cdhs_string(hand))) for hand in SAMPLE_HANDS},
        "by_suit": {
            "expr_for_suit": {s.char: _sexpr(model.expr_for_suit(s)) for s in suit.SUITS},
            "stopper_expr_for_suit": {s.char: _sexpr(model.stopper_expr_for_suit(s)) for s in suit.SUITS},
            "support_points_expr_for_suit": {s.char: _sexpr(model.support_points_expr_for_suit(s)) for s in suit.SUITS},
        },
        "NO_CONSTRAINTS": _sexpr(model.NO_CONSTRAINTS),
    }


# --- the corpus ---------------------------------------------------------------------------

def harness_tests(limit=None):
    """The harness's CompiledTests (subtests included) in the harness's order."""
    groups = []
    for group_name, expectations in sorted(test_sayc_data.sayc_expectations.items()):
        group = harness.TestGroup(group_name)
        group.add_expectation_lines(expectations)
        groups.append(group)
    tests = list(itertools.chain.from_iterable(group.tests for group in groups))
    if limit is not None:
        tests = tests[:limit]
    return tests


def _auction_key(call_history):
    return (call_history.dealer.char, call_history.vulnerability.name, call_history.calls_string())


def corpus_auctions(tests):
    """Every (dealer, vulnerability, calls) the harness bids over, and each extended by the
    expected call, sorted."""
    keys = set()
    for test in tests:
        keys.add(_auction_key(test.call_history))
        extended = test.call_history.copy_with_partial_history(len(test.call_history.calls))
        extended.calls.append(test.expected_call)
        keys.add(_auction_key(extended))
    return sorted(keys, key=lambda key: (key[0], key[1], len(key[2].split()), key[2]))


# --- auction-snapshots.jsonl, meanings.jsonl, interpretations.jsonl -----------------------

def _view_snapshot(view):
    return {
        "last_call": _call_name(view.last_call),
        "annotations_for_last_call": _enum_keys(view.annotations_for_last_call),
        "rule_for_last_call": _rule_name(view.rule_for_last_call),
        "annotations": _enum_keys(list(view.annotations)),
        "min_points": view.min_points,
        "max_points": view.max_points,
        "min_length": [view.min_length(s) for s in suit.SUITS],
        "max_length": [view.max_length(s) for s in suit.SUITS],
        "is_balanced": bool(view.is_balanced),
        "bid_suits": _suit_chars(view.bid_suits),
        "unbid_suits": _suit_chars(view.unbid_suits),
        # History._has_shown_suit(contracts_only=True): the suits shown by a contract call
        # (a double's promised suits do not count), as SupportForPartnersSuits reads them.
        "contract_bid_suits": [s.char for s in suit.SUITS
                               if view.history._has_shown_suit(s, view.position, contracts_only=True)],
        "could_have_more_points_than": {str(points): bool(view.could_have_more_points_than(points))
                                        for points in POINT_THRESHOLDS},
    }


def _group_snapshot(group):
    return {
        "min_points": group.min_points,
        "bid_suits": _suit_chars(group.bid_suits),
        "unbid_suits": _suit_chars(group.unbid_suits),
        "annotations": _enum_keys(list(group.annotations)),
    }


def _rule_by_call(history):
    names = []
    while history._previous_history is not None:
        names.append(_rule_name(history._rule_for_last_call))
        history = history._previous_history
    names.reverse()
    return names


def _call_to_rule_and_dropped(system, history):
    """RuleSelector._call_to_rule, and the calls it drops because several rules tie at the
    best category: ({call: rule}, [{call, category, rules}])."""
    maximal = {}
    for rule in system.rules:
        for category, call in rule.calls_over(history):
            if not history.call_history.is_legal_call(call):
                continue
            current = maximal.get(call)
            if not current:
                maximal[call] = (category, [rule])
            else:
                existing_category, existing_rules = current
                if category < existing_category:
                    maximal[call] = (category, [rule])
                elif category == existing_category:
                    existing_rules.append(rule)
    call_to_rule, dropped = {}, []
    for call in sorted(maximal):
        category, rules = maximal[call]
        if len(rules) > 1:
            dropped.append({"call": call.name, "category": category.key,
                            "rules": sorted(rule.name for rule in rules)})
        else:
            call_to_rule[call] = rules[0]
    return call_to_rule, dropped


def _meanings(system, history, call_to_rule, selector):
    """Per call: the variants (priority, meaning) of rule.meaning_of, and constraints_for_call
    rebuilt with the unmade calls in Call order (RuleSelector iterates a dict whose order the
    port cannot reproduce): (records, samples).  A record is {call, rule, variants: [{priority,
    meaning: hash}], negations: [{unmade call: [indices of its variants negated]} per variant],
    constraints: hash}; a sample carries the printed forms instead of hashes.  The rebuilt
    expression is checked against RuleSelector.constraints_for_call: selector_constraints
    (a hash) appears only when the two differ."""
    variants, errors = {}, {}
    for call in sorted(call_to_rule):
        try:
            variants[call] = list(call_to_rule[call].meaning_of(history, call))
        except Exception as error:  # a constraint that asserts on this auction
            errors[call] = _last_line(error)
    records, samples = [], []
    for call in sorted(call_to_rule):
        record = {"call": call.name, "rule": call_to_rule[call].name}
        sample = {"call": call.name, "rule": call_to_rule[call].name}
        if call in errors:
            record["error"] = sample["error"] = errors[call]
            records.append(record)
            samples.append(sample)
            continue
        situations, negations = [], []
        for priority, meaning in variants[call]:
            exprs = [meaning]
            negated = {}
            for unmade_call in sorted(call_to_rule):
                if unmade_call in errors or call_to_rule[unmade_call].requires_planning:
                    continue
                for index, (unmade_priority, unmade_meaning) in enumerate(variants[unmade_call]):
                    if system.priority_ordering.lt(priority, unmade_priority):
                        exprs.append(z3.Not(unmade_meaning))
                        negated.setdefault(unmade_call.name, []).append(index)
            situations.append(z3.And(exprs))
            negations.append(negated)
        constraints = z3.Or(situations)
        record["variants"] = [{"priority": repr(priority), "meaning": _hash(_sexpr(meaning))}
                              for priority, meaning in variants[call]]
        record["negations"] = negations
        record["constraints"] = _hash(_sexpr(constraints))
        try:
            selector_text = _sexpr(selector.constraints_for_call(call))
        except Exception as error:
            selector_text = "error: %s" % _last_line(error)
        if _hash(selector_text) != record["constraints"]:
            record["selector_constraints"] = _hash(selector_text)
        if errors:
            record["excluded_errors"] = _sorted_call_names(errors)
        sample["variants"] = [{"priority": repr(priority), "meaning": _sexpr(meaning)}
                              for priority, meaning in variants[call]]
        sample["constraints"] = _sexpr(constraints)
        records.append(record)
        samples.append(sample)
    return records, samples


def _forced_to_bid(history):
    try:
        return bool(SAYCForcingOracle().forced_to_bid(history))
    except Exception as error:
        return {"error": _last_line(error)}


def snapshot_auction(key, with_sample):
    """(snapshot, meanings, sample, interpretation) for one auction key.  Snapshot:
    {dealer, vulnerability, calls, legal_calls, unbid_suits, last_contract, us, them, everyone,
    views: {Me, Partner, LHO, RHO}, bid_suit_naturally: {position: {suit: bool}},
    first_natural_bidder: {suit: position}, annotations_by_call, rule_by_call, call_to_rule,
    dropped_calls, forced_to_bid}; or {..., error} when interpretation raised."""
    dealer, vulnerability, calls = key
    head = {"dealer": dealer, "vulnerability": vulnerability, "calls": calls}
    meanings = dict(head)
    sample = dict(head) if with_sample else None
    interpretation = dict(head)
    call_history = CallHistory.from_string(calls, dealer, vulnerability)
    system = Bidder().system
    try:
        with _silenced(), Interpreter().create_history(call_history) as history:
            snapshot = dict(head)
            snapshot["legal_calls"] = _sorted_call_names(history.legal_calls)
            snapshot["unbid_suits"] = [s.char for s in history.unbid_suits]
            snapshot["last_contract"] = _call_name(history.last_contract)
            snapshot["us"] = _group_snapshot(history.us)
            snapshot["them"] = _group_snapshot(history.them)
            snapshot["everyone"] = _group_snapshot(history.everyone)
            snapshot["views"] = {position.key: _view_snapshot(history.view_for(position)) for position in positions}
            snapshot["bid_suit_naturally"] = {
                position.key: {s.char: bool(history.bid_suit_naturally(s, position)) for s in suit.SUITS}
                for position in positions}
            snapshot["first_natural_bidder"] = {s.char: _position_key(history.first_natural_bidder(s))
                                                for s in suit.SUITS}
            snapshot["annotations_by_call"] = [_enum_keys(keys) for keys in history.annotations_by_call()]
            snapshot["rule_by_call"] = _rule_by_call(history)
            snapshot["forced_to_bid"] = _forced_to_bid(history)
            if history.call_history.is_complete():
                snapshot["call_to_rule"] = {}
                snapshot["dropped_calls"] = []
                meanings["calls_and_rules"] = []
                if sample is not None:
                    sample["calls_and_rules"] = []
            else:
                call_to_rule, dropped = _call_to_rule_and_dropped(system, history)
                snapshot["call_to_rule"] = {call.name: rule.name for call, rule in sorted(call_to_rule.items())}
                snapshot["dropped_calls"] = dropped
                selector = RuleSelector(system, history)
                if selector._call_to_rule != call_to_rule:
                    snapshot["selector_call_to_rule"] = {call.name: rule.name
                                                         for call, rule in sorted(selector._call_to_rule.items())}
                records, samples = _meanings(system, history, call_to_rule, selector)
                meanings["calls_and_rules"] = records
                if sample is not None:
                    sample["calls_and_rules"] = samples
    except Exception as error:
        text = _last_line(error)
        snapshot = dict(head, error=text)
        meanings["error"] = text
        if sample is not None:
            sample["error"] = text
    try:
        with _silenced():
            interpretation["interpretations"] = api.get_call_interpretations(calls, dealer, vulnerability)
    except Exception as error:
        interpretation["error"] = _last_line(error)
    return snapshot, meanings, sample, interpretation


def _snapshot_job(args):
    return snapshot_auction(*args)


# --- decisions.jsonl ----------------------------------------------------------------------

def _priority_pairs(pairs):
    return [[call.name, repr(priority)] for call, priority in pairs]


def decide(test):
    """{group, hand, calls, dealer, vulnerability, expected, subtest_of, possible, maximal,
    collision, call, rule}: the bidder's decision, step by step.  possible: every (call,
    priority) whose meaning the hand fits, in the order RuleSelector.possible_calls_for_hand
    adds them (Call order, each call's variants in meaning_of order); maximal: the undominated
    ones; then the planning filter, the name sort and the production order of
    Bidder.call_selection_for give the call and its rule.  bidder_call / bidder_rule appear
    only when Bidder.call_selection_for itself chose differently."""
    record = {
        "group": test.group.name,
        "hand": test.hand.cdhs_dot_string(),
        "calls": test.call_history.calls_string(),
        "dealer": test.call_history.dealer.char,
        "vulnerability": test.call_history.vulnerability.name,
        "expected": test.expected_call.name,
        "subtest_of": test.parent_test.call_history.calls_string() if test.parent_test else None,
    }
    bidder = Bidder()
    try:
        with _silenced():
            selection = bidder.call_selection_for(test.hand, test.call_history)
        bidder_call = _call_name(selection.call) if selection else None
        bidder_rule = _rule_name(selection.rule) if selection else None
    except Exception as error:
        record["error"] = _last_line(error)
        return record
    try:
        with _silenced(), Interpreter().create_history(test.call_history) as history:
            selector = RuleSelector(bidder.system, history)
            with _silenced():
                possible = selector.possible_calls_for_hand(test.hand, None)
            maximal = possible.maximal_calls_and_priorities()
            record["possible"] = _priority_pairs(possible._calls_and_priorities)
            record["maximal"] = _priority_pairs(maximal)
            chosen = sorted((pair for pair in maximal if not selector.rule_for_call(pair[0]).requires_planning),
                            key=lambda pair: pair[0].name)
            record["collision"] = None
            if not chosen:
                record["call"] = record["rule"] = None
            else:
                calls = [pair[0] for pair in chosen]
                if len(calls) > 1:
                    record["collision"] = {
                        "calls": [call.name for call in calls],
                        "rules": [selector.rule_for_call(call).name for call in calls],
                        "priorities": [repr(pair[1]) for pair in chosen],
                    }
                    calls = [min(calls, key=lambda call: (0 if call.is_contract() else 1 if call.is_double() or call.is_redouble() else 2, call))]
                record["call"] = calls[0].name
                record["rule"] = selector.rule_for_call(calls[0]).name
    except Exception as error:
        record["error"] = _last_line(error)
        return record
    if (bidder_call, bidder_rule) != (record["call"], record["rule"]):
        record["bidder_call"] = bidder_call
        record["bidder_rule"] = bidder_rule
    return record


# --- random-deals.jsonl -------------------------------------------------------------------

def bid_random_deal(index, seed):
    """{index, board, number, dealer, vulnerability, hands: {N, E, S, W}, calls, contract,
    declarer, decisions: [{position, call, rule, collision, no_call?, dropped?}], lead}.
    The deal is Board.random() after random.seed(seed * 1000003 + index)."""
    random.seed(seed * 1000003 + index)
    board = Board.random()
    history = board.call_history
    record = {
        "index": index,
        "board": board.identifier,
        "number": board.number,
        "dealer": history.dealer.char,
        "vulnerability": history.vulnerability.name,
        "hands": {position.char: board.deal.hand_for(position).cdhs_dot_string() for position in POSITIONS},
        "decisions": [],
    }
    bidder = Bidder()
    try:
        while not history.is_complete():
            position = history.position_to_call()
            with _silenced() as captured:
                selection = bidder.call_selection_for(board.deal.hand_for(position), history)
            decision = {"position": position.char}
            if selection is None:
                call = Pass()
                decision.update(call="P", rule=None, collision=False, no_call=True)
            else:
                call = selection.call
                decision.update(call=call.name, rule=_rule_name(selection.rule), collision=bool(selection.collision))
            dropped = captured.getvalue().count("Multiple rules have maximal category")
            if dropped:
                decision["dropped"] = dropped
            record["decisions"].append(decision)
            history.calls.append(call)
    except Exception as error:
        record["error"] = _last_line(error)
        return record
    record["calls"] = history.calls_string()
    record["contract"] = history.contract()
    record["declarer"] = history.declarer().char if history.declarer() else None
    record["lead"] = None
    if not history.is_passout():
        try:
            with _silenced():
                record["lead"] = api._opening_lead_for_board(board)
        except Exception as error:
            record["lead"] = {"error": _last_line(error)}
    return record


def _deal_job(args):
    return bid_random_deal(*args)


# --- core-cases.json ----------------------------------------------------------------------

CORE_AUCTIONS = [
    ("", "N", "None"), ("P", "N", "None"), ("P P P", "E", "N-S"), ("P P P P", "S", "E-W"),
    ("1S", "N", "Both"), ("1S P", "N", "None"), ("1S X", "W", "N-S"), ("1S X XX", "N", "None"),
    ("1S X XX P", "N", "None"), ("1N P 2C P 2D P 3N P P P", "E", "E-W"), ("1H 1S 2H 2S P P", "S", "Both"),
    ("1C P 1H P 1S P 2D P", "W", "None"), ("1S P 2S P P P", "N", "N-S"), ("7N", "N", "None"),
    ("7N X", "N", "None"), ("7N X XX", "N", "None"), ("1S P P X P P P", "N", "None"),
    ("2C P 2D P 2N P 3C P 3H P", "E", "Both"), ("P 1N P 2C X", "S", "E-W"), ("1D 1H 1S 2C", "W", "N-S"),
]

CORE_HANDS = [
    "KQ4.AQ8.K9873.K2", "AKT92.T98.AQ9.AT", "832.A.QJ652.JT73", "AKQJT98765432...", "...AKQJT98765432",
    "T9.AJ72.K65.Q732", "K74.9.J98.KJT742", "AKQ2.KQ4.AQJ.A32", "A.KQJ.T9876.5432", "QJ.KQ.T.A9876543",
    ".AKQJT9.AKQJT9.A", "J432.J432.J43.32", "AK.QJ.T98.765432", "KJ75.6.987.J6432", "Q53.J9.K84.T8632",
]


def _hand_case(hand):
    def stoppers(s):
        return {
            "first": hand.has_first_round_stopper(s),
            "second": hand.has_second_round_stopper(s),
            "third": hand.has_third_round_stopper(s),
            "fourth": hand.has_fourth_round_stopper(s),
        }
    return {
        "cdhs": hand.cdhs_dot_string(),
        "shdc": hand.shdc_dot_string(),
        "hcp": hand.high_card_points(),
        "hcp_in_suit": {s.char: hand.hcp_in_suit(s) for s in suit.SUITS},
        "length_points": hand.length_points(),
        "support_points": {s.char: hand.support_points(s) for s in suit.SUITS},
        "generic_support_points": hand.generic_support_points(),
        "is_balanced": hand.is_balanced(),
        "is_flat": hand.is_flat(),
        "suit_lengths": hand.suit_lengths(),
        "longest_suits": _suit_chars(hand.longest_suits()),
        "is_longest_suit": {s.char: hand.is_longest_suit(s) for s in suit.SUITS},
        "high_card_in_suit": {s.char: (hand.high_card_in_suit(s) if hand.length_of_suit(s) else None)
                              for s in suit.SUITS},
        "ace_count": hand.ace_count(),
        "king_count": hand.king_count(),
        "control_count": hand.control_count(),
        "stoppers": {s.char: stoppers(s) for s in suit.SUITS},
        "pretty_one_line": hand.pretty_one_line(),
    }


def _call_history_case(calls, dealer, vulnerability):
    history = CallHistory.from_string(calls, dealer, vulnerability)
    complete = history.is_complete()
    case = {
        "calls": calls,
        "dealer": dealer,
        "vulnerability": vulnerability,
        "identifier": history.identifier,
        "identifier_round_trip": CallHistory.from_identifier(history.identifier).identifier == history.identifier,
        "is_complete": complete,
        "is_passout": history.is_passout(),
        "last_call": _call_name(history.last_call),
        "last_non_pass": _call_name(history.last_non_pass()),
        "last_contract": _call_name(history.last_contract()),
        "last_to_call": history.last_to_call.char if history.last_to_call else None,
        "last_to_not_pass": history.last_to_not_pass().char if history.last_to_not_pass() else None,
        "position_to_call": history.position_to_call().char,
        "opener": history.opener().char if history.opener() else None,
        "declarer": history.declarer().char if history.declarer() else None,
        "dummy": history.dummy().char if history.dummy() else None,
        "contract": history.contract(),
        "competitive": history.competative_auction(),
        "calls_by": {position.char: [call.name for call in history.calls_by(position)] for position in POSITIONS},
        "possible_calls_over": [call.name for call in CallExplorer().possible_calls_over(history)],
        "ascending_partial_histories": [partial.calls_string() for partial in history.ascending_partial_histories(4)],
    }
    if not complete:
        case["legal_calls"] = [name for name in ALL_CALL_NAMES if history.is_legal_call(Call.from_string(name))]
        case["can_double"] = bool(history.last_non_pass() and history.can_double())
        case["can_redouble"] = bool(history.last_non_pass() and history.can_redouble())
    return case


def core_cases(seed, deal_records):
    """{boards, call_histories, hands, calls, vulnerability, dealer_from_board_number, positions,
    leads, bid_suits}: cases for the core types, and for leads.choose and leads.bid_suits drawn
    from the random deals' opening leads."""
    boards = []
    for index in range(CORE_BOARDS):
        random.seed(seed + index)
        board = Board.random()
        deal = board.deal
        boards.append({
            "identifier": board.identifier,
            "number": board.number,
            "dealer": board.call_history.dealer.char,
            "vulnerability": board.call_history.vulnerability.name,
            "hands": {position.char: deal.hand_for(position).cdhs_dot_string() for position in POSITIONS},
            "deal_identifier": deal.identifier,
            "old_identifier": deal.old_identifier,
            "round_trip": Board.from_identifier(board.identifier).identifier == board.identifier,
            "old_identifier_round_trip": Deal.from_identifier(deal.old_identifier).identifier == deal.identifier,
            "pretty_one_line": deal.pretty_one_line(),
        })
    with_history = Board.from_identifier("%s:%s" % (boards[0]["identifier"], "1N,P,2C"))
    boards_with_history = [{
        "identifier": with_history.identifier,
        "calls": with_history.call_history.calls_string(),
        "dealer": with_history.call_history.dealer.char,
        "vulnerability": with_history.call_history.vulnerability.name,
    }]
    lead_cases, bid_suit_cases = [], []
    for record in deal_records:
        lead = record.get("lead")
        if not lead or "error" in lead or len(lead_cases) >= LEAD_CASES:
            continue
        history = CallHistory.from_string(record["calls"], record["dealer"], record["vulnerability"])
        leader = Position.from_char(lead["leader"])
        hand = Hand.from_cdhs_string(record["hands"][lead["leader"]]).shdc_dot_string()
        strain = history.last_contract().name[1]
        aware = leads.choose(hand, strain, lead["partner_suits"], lead["their_suits"])
        blind = leads.choose(hand, strain, lead["partner_suits"], lead["their_suits"], blind=True)
        lead_cases.append({
            "hand": hand, "strain": strain,
            "partner_suits": lead["partner_suits"], "their_suits": lead["their_suits"],
            "card": aware[0], "reason": aware[1], "blind_card": blind[0], "blind_reason": blind[1],
        })
        artificial = [annotations.Artificial.key in keys for keys in record.get("annotations_by_call", [])] or None
        bid_suit_cases.append({
            "calls": history.calls_string().split(), "dealer_index": history.dealer.index,
            "leader_index": leader.index, "artificial": artificial,
            "result": list(leads.bid_suits(history.calls_string().split(), history.dealer.index, leader.index, artificial)),
        })
    return {
        "boards": boards,
        "boards_with_history": boards_with_history,
        "call_histories": [_call_history_case(*auction) for auction in CORE_AUCTIONS],
        "hands": [_hand_case(Hand.from_cdhs_string(hand)) for hand in CORE_HANDS],
        "calls": {
            "sorted": ALL_CALL_NAMES,
            "suited_names": list(Call.suited_names()),
            "notrump_names": list(Call.notrump_names()),
            "suited_names_between_2C_5S": Call.suited_names_between("2C", "5S"),
        },
        "vulnerability": {
            str(number): {
                "name": Vulnerability.from_board_number(number).name,
                "identifier": Vulnerability.from_board_number(number).identifier,
                "dealer": CallHistory.dealer_from_board_number(number).char,
                "vulnerable": {position.char: Vulnerability.from_board_number(number).is_vulnerable(position)
                               for position in POSITIONS},
            } for number in range(1, 17)
        },
        "positions": [{"char": p.char, "name": p.name, "index": p.index, "lho": p.lho.char,
                       "partner": p.partner.char, "rho": p.rho.char} for p in POSITIONS],
        "leads": lead_cases,
        "bid_suits": bid_suit_cases,
    }


# --- writing ------------------------------------------------------------------------------

def _write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")


def _write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
            f.write("\n")


def _map(pool, function, jobs):
    if pool is None:
        return list(map(function, jobs))
    return pool.map(function, jobs, chunksize=4)


def export(out, deals=DEFAULT_DEALS, seed=DEFAULT_SEED, limit=None, jobs=None):
    """Write every fixture into `out`; returns a summary dict."""
    started = time.time()
    os.makedirs(out, exist_ok=True)
    system = Bidder().system
    _write_json(os.path.join(out, "rules-manifest.json"), rules_manifest(system))
    _write_json(os.path.join(out, "vocabulary.json"), vocabulary())
    _write_json(os.path.join(out, "categories.json"), categories_fixture([rule.name for rule in system.rules]))
    _write_json(os.path.join(out, "model-expressions.json"), model_expressions())

    tests = harness_tests(limit)
    auctions = corpus_auctions(tests)
    _log("exporting %d auctions, %d decisions, %d deals" % (len(auctions), len(tests), deals))
    pool = None if jobs == 1 else multiprocessing.Pool(jobs)
    try:
        results = _map(pool, _snapshot_job, [(key, index < SAMPLE_AUCTIONS) for index, key in enumerate(auctions)])
        snapshots = [result[0] for result in results]
        _write_jsonl(os.path.join(out, "auction-snapshots.jsonl"), snapshots)
        _write_jsonl(os.path.join(out, "meanings.jsonl"), [result[1] for result in results])
        _write_jsonl(os.path.join(out, "meanings-sample.jsonl"), [result[2] for result in results if result[2] is not None])
        _write_jsonl(os.path.join(out, "interpretations.jsonl"), [result[3] for result in results])
        _log("snapshots done at %.0fs" % (time.time() - started))

        decisions = _map(pool, decide, tests)
        _write_jsonl(os.path.join(out, "decisions.jsonl"), decisions)
        _log("decisions done at %.0fs" % (time.time() - started))

        deal_records = _map(pool, _deal_job, [(index, seed) for index in range(deals)])
    finally:
        if pool is not None:
            pool.close()
            pool.join()
    # The annotations of every call, for leads.bid_suits cases: from the deal's own auction.
    for record in deal_records:
        if "calls" in record and record.get("lead"):
            try:
                with _silenced(), Interpreter().create_history(
                        CallHistory.from_string(record["calls"], record["dealer"], record["vulnerability"])) as history:
                    record["annotations_by_call"] = [_enum_keys(keys) for keys in history.annotations_by_call()]
            except Exception as error:
                record["annotations_error"] = _last_line(error)
    _write_jsonl(os.path.join(out, "random-deals.jsonl"), deal_records)
    _write_json(os.path.join(out, "core-cases.json"), core_cases(seed, deal_records))

    summary = {
        "auctions": len(auctions),
        "auction_errors": [s["calls"] for s in snapshots if "error" in s],
        "meanings": sum(len(r[1].get("calls_and_rules", [])) for r in results),
        "meaning_errors": sum(1 for r in results for m in r[1].get("calls_and_rules", []) if "error" in m),
        "interpretation_errors": [r[3]["calls"] for r in results if "error" in r[3]],
        "decisions": len(decisions),
        "decision_errors": [d["calls"] for d in decisions if "error" in d],
        "bidder_disagreements": [(d["hand"], d["calls"]) for d in decisions if "bidder_call" in d],
        "deals": len(deal_records),
        "deal_errors": [r["index"] for r in deal_records if "error" in r],
        "seconds": round(time.time() - started, 1),
    }
    _log("done in %.0fs" % summary["seconds"])
    return summary


def check(out, **kwargs):
    """Regenerate into a temporary directory and diff against `out`; returns the exit status."""
    with tempfile.TemporaryDirectory() as work:
        export(work, **kwargs)
        status = 0
        for name in FILES:
            committed, fresh = os.path.join(out, name), os.path.join(work, name)
            if not os.path.exists(committed):
                print("MISSING: %s" % committed)
                status = 1
                continue
            with open(committed, encoding="utf-8") as f:
                before = f.read().splitlines()
            with open(fresh, encoding="utf-8") as f:
                after = f.read().splitlines()
            diff = list(difflib.unified_diff(before, after, fromfile=committed, tofile="regenerated", lineterm="", n=0))
            if diff:
                status = 1
                print("\n".join(diff[:200]))
                if len(diff) > 200:
                    print("... %d more diff lines in %s" % (len(diff) - 200, name))
        print("fixtures %s" % ("differ: run python -m tests.export_fixtures" if status else "ok"))
        return status


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", default=DEFAULT_OUT, help="output directory (default: %(default)s)")
    parser.add_argument("--check", action="store_true", help="regenerate to a temp dir and diff against --out")
    parser.add_argument("--deals", type=int, default=DEFAULT_DEALS, help="random deals to bid (default: %(default)s)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="seed of the random deals (default: %(default)s)")
    parser.add_argument("--limit", type=int, default=None, help="only the first N harness tests (for a quick run)")
    parser.add_argument("--jobs", type=int, default=None, help="worker processes (default: the CPU count; 1: in process)")
    args = parser.parse_args(argv)
    kwargs = dict(deals=args.deals, seed=args.seed, limit=args.limit, jobs=args.jobs)
    if args.check:
        return check(args.out, **kwargs)
    summary = export(args.out, **kwargs)
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
