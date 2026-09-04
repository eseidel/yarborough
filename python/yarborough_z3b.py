"""JSON-friendly z3b operations used by the browser worker."""

import json

import categories
import leads
from core.board import Board
from core.call import Pass
from core.callexplorer import CallExplorer
from core.callhistory import CallHistory
from core.position import Position
from core.suit import SUITS
from z3b import rules
from z3b.bidder import Bidder, InconsistentHistoryException, Interpreter
from z3b.forcing import SAYCForcingOracle
from z3b.preconditions import annotations


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


class ConstraintsSerializer:
    """Serializes a position view's hand constraints into human-readable text."""

    MAX_HCP_PER_HAND = 37
    EMPTY_HCP_RANGE = (0, MAX_HCP_PER_HAND)

    def __init__(self, position_view):
        self._hcp_range = (position_view.min_points, position_view.max_points)
        self._suit_length_ranges = [
            (position_view.min_length(suit), position_view.max_length(suit))
            for suit in SUITS
        ]

    def _string_for_range(self, range_tuple, global_max):
        min_value, max_value = range_tuple
        if min_value == max_value:
            return str(min_value)
        if min_value == 0 and max_value >= global_max:
            return "?"
        if max_value >= global_max:
            return "%s+" % min_value
        return "%s-%s" % (min_value, max_value)

    def _pretty_string_for_suit(self, suit, max_suit_length_to_show=None):
        max_suit_length_to_show = max_suit_length_to_show or 6
        suit_string = self._string_for_range(
            self._suit_length_ranges[suit.index], max_suit_length_to_show
        )
        if suit_string == "?":
            return None
        return suit_string + suit.char

    def explore_string(self):
        if (
            self._hcp_range == self.EMPTY_HCP_RANGE
            and self._suit_length_ranges.count((0, 13)) == 4
        ):
            return "?"
        suit_strings = [self._pretty_string_for_suit(suit) for suit in SUITS]
        suit_strings = [s for s in suit_strings if s]
        pretty_string = "%s hcp" % self._string_for_range(
            self._hcp_range, self.MAX_HCP_PER_HAND
        )
        if suit_strings:
            return "%s, %s" % (pretty_string, " ".join(suit_strings))
        return pretty_string


def _format_rule_name(rule_name):
    if not rule_name:
        return None
    return categories.format_rule_name(rule_name)


def _knowledge_string(position_view, interpreter):
    explore_string = ConstraintsSerializer(position_view).explore_string()
    annotations_whitelist = {annotations.Artificial, annotations.NotrumpSystemsOn}
    annotations_for_last_call = (
        set(position_view.annotations_for_last_call) & annotations_whitelist
    )
    if annotations_for_last_call:
        pretty_string = "%s %s" % (
            explore_string,
            ", ".join(map(str, annotations_for_last_call)),
        )
    else:
        pretty_string = explore_string

    if position_view.rule_for_last_call:
        try:
            partner_future = interpreter.extend_history(position_view.history, Pass())
            if SAYCForcingOracle().forced_to_bid(partner_future):
                pretty_string += " Forcing"
        except InconsistentHistoryException:
            pass
    return pretty_string.strip()


def _selection_result(selection, knowledge_string=None, category=None):
    if not selection or not selection.call:
        return {
            "call_name": "P",
            "rule_name": None,
            "description": None,
            "knowledge_string": None,
            "category": category,
        }

    rule = selection.rule
    return {
        "call_name": selection.call.name,
        "rule_name": _format_rule_name(rule.name) if rule else None,
        "description": rule.explanation_for_bid(selection.call) if rule else None,
        "knowledge_string": knowledge_string,
        "category": category,
    }


def _category_for_selection(selection, history):
    """The three-level category of the call `selection` makes (see categories.py)."""

    rule = selection.rule if selection and selection.call else None
    return categories.category_for(rule.name if rule else None, history)


def get_next_call(identifier):
    """Return the z3b recommendation for the player to act."""

    return _selection_result(_selection_for_board(_board(identifier)))["call_name"]


def get_suggested_call(identifier):
    """Return a z3b recommendation and its available explanation."""

    board = _board(identifier)
    selection = _selection_for_board(board)
    category = _category_for_selection(selection, board.call_history)
    if not selection or not selection.call:
        return _selection_result(None, category=category)

    knowledge_string = None
    interpreter = Interpreter()
    try:
        with interpreter.create_history(board.call_history) as history:
            extended_history = interpreter.extend_history(history, selection.call)
            knowledge_string = _knowledge_string(extended_history.rho, interpreter)
    except InconsistentHistoryException:
        knowledge_string = None

    return _selection_result(
        selection, knowledge_string=knowledge_string, category=category
    )


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
            knowledge_string = None
            try:
                extended_history = interpreter.extend_history(history, call)
                rule = extended_history.rho.rule_for_last_call
                knowledge_string = _knowledge_string(extended_history.rho, interpreter)
            except InconsistentHistoryException:
                pass

            interpretations.append(
                {
                    "call_name": call.name,
                    "rule_name": _format_rule_name(rule.name) if rule else None,
                    "description": (
                        rule.explanation_for_bid(call) if rule is not None else None
                    ),
                    "knowledge_string": knowledge_string,
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


def get_full_autobid(identifier):
    """Simulate a full autobidder auction for a board until complete."""
    board = _board(identifier)
    bidder = Bidder()
    while not board.call_history.is_complete():
        position = board.call_history.position_to_call()
        hand = board.deal.hand_for(position)
        selection = bidder.call_selection_for(hand, board.call_history)
        call = selection.call if selection and selection.call else Pass()
        board.call_history.calls.append(call)
    return [c.name for c in board.call_history.calls]


def _opening_lead_for_board(board):
    history = board.call_history
    if not history.is_complete():
        raise BiddingInputError("the auction is not complete")
    if history.is_passout():
        raise BiddingInputError("the board was passed out")
    contract = history.last_contract()
    declarer = history.declarer()
    leader = Position.from_index((declarer.index + 1) % 4)
    with Interpreter().create_history(history) as interpreted:
        artificial = [
            annotations.Artificial in call_annotations
            for call_annotations in interpreted.annotations_by_call()
        ]
    partner_suits, their_suits = leads.bid_suits(
        [call.name for call in history.calls], history.dealer.index, leader.index, artificial
    )
    hand = board.deal.hand_for(leader).shdc_dot_string()
    card, reason = leads.choose(hand, contract.name[1], partner_suits, their_suits)
    return {
        "leader": leader.char,
        "card": card,
        "reason": reason,
        "partner_suits": partner_suits,
        "their_suits": their_suits,
    }


def get_opening_lead(identifier):
    """The textbook opening lead against the contract a completed auction reached.

    Returns the leader ("W"), the card ("D4": suit then rank), why, and the suits the
    lead was chosen around: partner's natural suits and the declaring side's.
    """

    return _opening_lead_for_board(_board(identifier))


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
    if method == "get_full_autobid":
        return get_full_autobid(arguments.get("identifier"))
    if method == "get_opening_lead":
        return get_opening_lead(arguments.get("identifier"))
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
