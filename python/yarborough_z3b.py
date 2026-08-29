"""JSON-friendly z3b operations used by the browser worker."""

import json

from core.board import Board
from core.callexplorer import CallExplorer
from core.callhistory import CallHistory
from z3b import rules
from z3b.bidder import Bidder, InconsistentHistoryException, Interpreter


class BiddingInputError(ValueError):
    """Raised when a frontend request cannot be represented by z3b."""


class FocusGenerationError(RuntimeError):
    """Raised when a requested practice focus cannot be generated in time."""


# Bound rejection sampling so a browser request cannot run indefinitely.
MAX_FOCUS_ATTEMPTS = 5_000

_VULNERABILITIES = {
    "None": "None",
    "NS": "N-S",
    "N-S": "N-S",
    "EW": "E-W",
    "E-W": "E-W",
    "Both": "Both",
}

_FOCUS_RULES = {
    "Notrump": rules.NotrumpOpening,
    "Preempt": rules.PreemptiveOpen,
    "Strong2C": rules.StrongTwoClubs,
}


def _require_string(value, field):
    if not isinstance(value, str):
        raise BiddingInputError("%s must be a string" % field)
    return value


def _normalize_vulnerability(vulnerability):
    try:
        return _VULNERABILITIES[vulnerability]
    except KeyError as error:
        raise BiddingInputError(
            "vulnerability must be one of %s" % ", ".join(_VULNERABILITIES)
        ) from error


def _call_history(calls, dealer, vulnerability):
    calls = _require_string(calls, "calls")
    dealer = _require_string(dealer, "dealer").upper()
    if dealer not in ("N", "E", "S", "W"):
        raise BiddingInputError("dealer must be one of N, E, S, W")
    vulnerability = _normalize_vulnerability(
        _require_string(vulnerability, "vulnerability")
    )
    try:
        return CallHistory.from_string(calls, dealer, vulnerability)
    except (AssertionError, TypeError, ValueError) as error:
        raise BiddingInputError("invalid call history: %s" % calls) from error


def _board(identifier):
    identifier = _require_string(identifier, "identifier")
    try:
        return Board.from_identifier(identifier)
    except (AssertionError, IndexError, TypeError, ValueError) as error:
        raise BiddingInputError("invalid board identifier: %s" % identifier) from error


def _selection_for_board(board):
    history = board.call_history
    if history.is_complete():
        raise BiddingInputError("cannot select a call after the auction is complete")
    position = history.position_to_call()
    return Bidder().call_selection_for(board.deal.hand_for(position), history)


def _selection_result(selection):
    if not selection:
        raise BiddingInputError("z3b could not select a unique call")

    rule = selection.rule
    return {
        "call_name": selection.call.name,
        "rule_name": rule.name if rule else None,
        "description": rule.explanation_for_bid(selection.call) if rule else None,
    }


def get_next_call(identifier):
    """Return the z3b recommendation for the player to act."""

    return _selection_result(_selection_for_board(_board(identifier)))["call_name"]


def get_suggested_call(identifier):
    """Return a z3b recommendation and its available explanation."""

    return _selection_result(_selection_for_board(_board(identifier)))


def get_call_interpretations(calls, dealer, vulnerability):
    """Return rule metadata for every legal next call in an auction."""

    call_history = _call_history(calls, dealer, vulnerability)
    if call_history.is_complete():
        return []

    interpretations = []
    interpreter = Interpreter()
    with interpreter.create_history(call_history) as history:
        for call in CallExplorer().possible_calls_over(call_history):
            rule = None
            try:
                extended_history = interpreter.extend_history(history, call)
                rule = extended_history.rho.rule_for_last_call
            except InconsistentHistoryException:
                pass

            interpretations.append(
                {
                    "call_name": call.name,
                    "rule_name": rule.name if rule else None,
                    "description": (
                        rule.explanation_for_bid(call) if rule is not None else None
                    ),
                }
            )
    return interpretations


def _matches_focus(selection, focus):
    if focus == "Random":
        return True
    if not selection or not selection.rule:
        return False
    expected_rule = _FOCUS_RULES[focus]
    return issubclass(selection.rule.dsl_rule, expected_rule)


def generate_filtered_board(
    focus, board_factory=Board.random, max_attempts=MAX_FOCUS_ATTEMPTS
):
    """Generate a focused board or fail after at most ``max_attempts`` tries."""

    focus = _require_string(focus, "focus")
    if focus not in ("Random", *_FOCUS_RULES):
        raise BiddingInputError("unknown practice focus: %s" % focus)
    if not isinstance(max_attempts, int) or max_attempts < 1:
        raise BiddingInputError("max_attempts must be a positive integer")

    for _ in range(max_attempts):
        board = board_factory()
        if focus == "Random" or _matches_focus(_selection_for_board(board), focus):
            return board.identifier

    raise FocusGenerationError(
        "could not generate a %s practice board after %d attempts"
        % (focus, max_attempts)
    )


def dispatch(method, arguments):
    """Dispatch an RPC request after validating its primitive JSON shape."""

    method = _require_string(method, "method")
    if not isinstance(arguments, dict):
        raise BiddingInputError("arguments must be an object")

    if method == "get_next_call":
        return get_next_call(arguments.get("identifier"))
    if method == "get_suggested_call":
        return get_suggested_call(arguments.get("identifier"))
    if method == "get_call_interpretations":
        return get_call_interpretations(
            arguments.get("calls"),
            arguments.get("dealer"),
            arguments.get("vulnerability"),
        )
    if method == "generate_filtered_board":
        return generate_filtered_board(arguments.get("focus"))
    raise BiddingInputError("unknown engine method: %s" % method)


def dispatch_json(request_json):
    """Execute a JSON RPC request and return a JSON response string."""

    try:
        request = json.loads(_require_string(request_json, "request_json"))
    except json.JSONDecodeError as error:
        raise BiddingInputError("request_json must contain valid JSON") from error
    if not isinstance(request, dict):
        raise BiddingInputError("request_json must contain an object")
    return json.dumps(dispatch(request.get("method"), request.get("arguments")))
