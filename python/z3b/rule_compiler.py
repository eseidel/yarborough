# Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

from core.call import Call
from itertools import chain
from functools import cache
from z3b import enum
from z3b import purposes
from z3b import prefer
from z3b import model
from z3b.constraints import Constraint
from z3b.preconditions import implies_artificial, annotations
import z3


def _is_not_empty_or_none(x):
    # x may be a z3 expression, which must not be compared with ==.
    if isinstance(x, (list, tuple, dict)):
        return len(x) > 0
    return x is not None


categories = enum.Enum(
    "Relay",
    "Gadget",
    "NotrumpSystem",
    "Default",
    "Natural",
    "LawOfTotalTricks",
    "NaturalPass",
    "DefaultPass",
)

class PriorityOrdering(object):
    """Compares two variants of possible calls (purposes.Priority)."""
    def lt(self, left, right):
        """left is a worse call than right: a worse purpose; the same purpose and a worse
        strain under the purpose's preference; a deeper fallback; or, within one rule, a
        worse place in the rule's own preference.  Two rules of one purpose and strain are
        otherwise incomparable: a collision if both are possible (their meanings should not
        both admit one hand)."""
        if left.rank != right.rank:
            return left.rank > right.rank  # a lower rank number is a better purpose
        if left.strain != right.strain and left.strain is not None and right.strain is not None:
            return left.strain > right.strain
        if left.fallback != right.fallback:
            return left.fallback > right.fallback  # a deeper fallback loses
        same_rule = left.rule is right.rule or (
            left.rule is not None and right.rule is not None and left.rule.name == right.rule.name)
        if same_rule:
            return left.key > right.key
        return False


priority_ordering = PriorityOrdering()


# This is a public interface from DSL Rules to the rest of the system.
class CompiledRule(object):
    def __init__(self, rule, preconditions, known_calls, shared_constraints, annotations, constraints, purposes_per_call=None, conditional_purposes_per_call=None, preconditions_per_call=None):
        self.dsl_rule = rule
        self.preconditions_per_call = preconditions_per_call or {}
        self.purposes_per_call = purposes_per_call or {}
        self.conditional_purposes_per_call = conditional_purposes_per_call or {}
        self.preconditions = preconditions
        self.known_calls = known_calls
        self.shared_constraints = shared_constraints
        self._annotations = annotations
        self.constraints = constraints
        # FIXME: Should forcing be an annotation instead?  It has an awkward tri-state currently.
        self.forcing = self.dsl_rule.forcing

    @property
    def requires_planning(self):
        return self.dsl_rule.requires_planning

    def annotations_for_call(self, call):
        if self.dsl_rule.annotations_per_call:
            # Tuple keys name several calls, as in constraints (Cappelletti's ('2C', '2D', '2N')
            # was never matched before this flattening, so those calls read as natural).
            per_call_annotations = RuleCompiler._flatten_tuple_keyed_dict(self.dsl_rule.annotations_per_call).get(
                call.name)
            if per_call_annotations:
                return self._annotations | set(RuleCompiler._ensure_list(per_call_annotations))
        return self._annotations

    @property
    def name(self):
        return self.dsl_rule.name()

    def __str__(self):
        return self.name

    def __repr__(self):
        # List printing looks nicer if we lie here.
        return self.dsl_rule.name()

    # FIXME: This exists for compatiblity with KBB's Rule interface and is used by autobid_handler.py
    def explanation_for_bid(self, call):
        explanation = self.dsl_rule.explanations_per_call.get(call.name)
        if explanation:
            return explanation
        return self.dsl_rule.explanation

    def _fits_preconditions(self, history, call, expected_call=None):
        try:
            for precondition in self.preconditions + list(RuleCompiler._ensure_list(self.preconditions_per_call.get(call.name, []))):
                if not precondition.fits(history, call):
                    if call == expected_call and expected_call in self.known_calls:
                        print(" %s failed: %s" % (self, precondition))
                    return False
        except Exception as e:
            print("Exception evaluating preconditions for %s" % self.name)
            raise
        return True

    def calls_over(self, history, expected_call=None):
        # A set intersection iterates in hash order; yield the calls in Call order instead.
        for call in sorted(history.legal_calls.intersection(self.known_calls)):
            if self._fits_preconditions(history, call, expected_call):
                yield self.dsl_rule.category, call

    def _constraint_exprs_for_call(self, history, call):
        exprs = []
        per_call_constraints = self.constraints.get(call.name)
        if per_call_constraints is not None:
            exprs.extend(RuleCompiler.exprs_from_constraints(
                per_call_constraints, history, call))
        exprs.extend(RuleCompiler.exprs_from_constraints(
            self.shared_constraints, history, call))
        return exprs

    def purpose_for_call(self, history, call):
        """The declared purpose of this rule making `call`: per call, else the rule's; a
        callable purpose is asked with the auction (a natural bid raises, rebids or
        discovers depending on who bid the suit)."""
        purpose = self.purposes_per_call.get(call.name, self.dsl_rule.purpose)
        assert purpose, "%s declares no purpose" % self.name
        if callable(purpose) and not isinstance(purpose, str):
            purpose = purpose(history, call)
        return purposes.resolve(purpose, call)

    def meaning_of(self, history, call):
        """(priority, meaning) pairs, one per variant of the call: the rule's purpose (or a
        conditional purpose, its condition folded into the meaning), the purpose's strain
        preference, and the rule's own preference (prefer)."""
        try:
            exprs = self._constraint_exprs_for_call(history, call)
            purpose = self.purpose_for_call(history, call)

            def variants():
                """(key, exprs): the rule's own preference, one variant per entry that fits."""
                for key, condition in prefer.variants(self.dsl_rule.prefer or [], self.known_calls, history, call):
                    yield key, ([] if condition is None else RuleCompiler.exprs_from_constraints(condition, history, call))

            def strain_variants(purpose_name):
                """(rank, exprs) under the purpose's strain preference; a pass takes the
                strain of the contract it passes."""
                target = call if call.is_contract() else history.call_history.last_contract()
                if target is None:
                    yield None, []
                    return
                for rank, condition_name in purposes.strain_variants(purpose_name, target):
                    condition = [] if condition_name is None else RuleCompiler.exprs_from_constraints(
                        purposes.CONDITIONS[condition_name], history, call)
                    yield rank, condition

            def priority(purpose_name, key, strain):
                return purposes.Priority(purpose_name, rule=self, key=key, strain=strain,
                                         fallback=int(self.dsl_rule.fallback))

            # A conditional purpose promotes the call when the hand meets the condition.
            conditional_purposes = list(self.conditional_purposes_per_call.get(call.name, []))
            conditional_purposes += list(self.dsl_rule.conditional_purposes)
            for entry in conditional_purposes:
                condition, promoted = entry[0], entry[1]
                # A third element names the base purpose the promotion applies to (a natural
                # bid is a raise only when partner bid the suit).
                if len(entry) > 2 and entry[2] is not None and purposes.resolve(entry[2], call) != purpose:
                    continue
                assert len(entry) <= 3, "%s: a conditional purpose is (condition, purpose[, base purpose])" % self.name
                promoted_name = purposes.resolve(promoted, call)
                condition_exprs = RuleCompiler.exprs_from_constraints(condition, history, call)
                for key, key_exprs in variants():
                    for strain, strain_exprs in strain_variants(promoted_name):
                        yield priority(promoted_name, key, strain), z3.And(exprs + key_exprs + condition_exprs + strain_exprs)
            for key, key_exprs in variants():
                for strain, strain_exprs in strain_variants(purpose):
                    yield priority(purpose, key, strain), z3.And(exprs + key_exprs + strain_exprs)
        except:
            print("Exception compiling meaning_of %s over %s with %s" %
                  (call, history.call_history.calls_string(), self))
            raise


class RuleCompiler(object):
    @classmethod
    def exprs_from_constraints(cls, constraints, history, call):
        if constraints is None or (isinstance(constraints, (list, tuple)) and not constraints):
            return [model.NO_CONSTRAINTS]

        if isinstance(constraints, Constraint):
            return [constraints.expr(history, call)]

        if isinstance(constraints, z3.ExprRef):
            return [constraints]

        return chain.from_iterable([cls.exprs_from_constraints(constraint, history, call) for constraint in constraints])

    @classmethod
    def _collect_from_ancestors(cls, dsl_class, property_name):
        # The DSL expects that parent preconditions, etc. apply before child ones.  Only the
        # class that DEFINES the property contributes it: getattr would also return a parent's
        # value for every child that inherits it, listing the same objects several times.
        return [vars(ancestor)[property_name] for ancestor in reversed(dsl_class.__mro__)
                if property_name in vars(ancestor)]

    @classmethod
    def _ensure_list(cls, value_or_list):
        if not hasattr(value_or_list, '__iter__') or isinstance(value_or_list, str):
            return [value_or_list]
        return value_or_list

    @classmethod
    def _joined_list_from_ancestors(cls, dsl_class, property_name):
        values_from_ancestors = cls._collect_from_ancestors(
            dsl_class, property_name)
        mapped_values = list(map(cls._ensure_list, values_from_ancestors))
        return list(chain.from_iterable(mapped_values))

    @classmethod
    def _compile_known_calls(cls, dsl_class, constraints):
        if dsl_class.call_names:
            call_names = cls._ensure_list(dsl_class.call_names)
        else:
            call_names = list(constraints.keys())
        assert call_names, "%s: call_names or a constraints map is required." % dsl_class.__name__
        return list(map(Call.from_string, call_names))

    @classmethod
    def _flatten_tuple_keyed_dict(cls, original_dict):
        flattened_dict = {}
        for tuple_key, value in original_dict.items():
            # FIXME: Unclear what this is for?
            if hasattr(tuple_key, '__iter__') and not isinstance(tuple_key, str):
                for key in tuple_key:
                    assert key not in flattened_dict, "Key (%s) was listed twice in %s" % (
                        key, original_dict)
                    flattened_dict[key] = value
            else:
                assert tuple_key not in flattened_dict, "Key (%s) was listed twice in %s" % (
                    tuple_key, original_dict)
                flattened_dict[tuple_key] = value
        return flattened_dict

    @classmethod
    def _compile_annotations(cls, dsl_class):
        compiled_set = set(cls._joined_list_from_ancestors(
            dsl_class, 'annotations'))
        # FIXME: We should probably assert that no more than one of the "implies_artificial"
        # annotations are in this set at once.  Those all have distinct meanings.
        if implies_artificial.intersection(compiled_set):
            compiled_set.add(annotations.Artificial)
        return compiled_set

    @classmethod
    def _validate_rule(cls, dsl_class):
        # Rules have to apply some constraints to the hand.
        assert _is_not_empty_or_none(dsl_class.constraints) or _is_not_empty_or_none(dsl_class.shared_constraints), "" + \
            dsl_class.name() + " is missing constraints"
        properties = list(dsl_class.__dict__.keys())
        public_properties = [p for p in properties if not p.startswith("_")]
        unexpected_properties = set(public_properties) - Rule.ALLOWED_KEYS
        assert not unexpected_properties, "%s defines unexpected properties: %s" % (
            dsl_class, unexpected_properties)

    @classmethod
    @cache
    def compile(cls, dsl_rule):
        try:
            cls._validate_rule(dsl_rule)
            constraints = cls._flatten_tuple_keyed_dict(dsl_rule.constraints)
            known_calls = cls._compile_known_calls(dsl_rule, constraints)
            unknown = prefer.names(dsl_rule.prefer or []) - set(call.name for call in known_calls)
            assert not unknown, "%s: prefer names calls it cannot make: %s" % (dsl_rule.name(), sorted(unknown))
            # Unclear if compiled results should be cached on the rule?
            return CompiledRule(dsl_rule,
                                known_calls=known_calls,
                                annotations=cls._compile_annotations(dsl_rule),
                                preconditions=cls._joined_list_from_ancestors(
                                    dsl_rule, 'preconditions'),
                                shared_constraints=cls._joined_list_from_ancestors(
                                    dsl_rule, 'shared_constraints'),
                                constraints=constraints,
                                purposes_per_call=cls._flatten_tuple_keyed_dict(dsl_rule.purposes_per_call),
                                conditional_purposes_per_call=cls._flatten_tuple_keyed_dict(dsl_rule.conditional_purposes_per_call),
                                preconditions_per_call=cls._flatten_tuple_keyed_dict(dsl_rule.preconditions_per_call),
                                )
        except:
            print("Exception compiling %s" % dsl_rule)
            raise


# The rules of SAYC are all described in terms of Rule.
# These classes exist to support the DSL and make it easy to concisely express
# the conventions of SAYC.
class Rule(object):
    # All properties with [] (empty list) defaults, auto-collect
    # from parent classes.  foo = Parent.foo + [bar] is never necessary in this DSL.
    annotations = []
    annotations_per_call = {}  # { '1C' : (annotations.Foo, annotations.Bar) }
    call_names = None  # For when all calls share the same constraints
    category = categories.Default  # Intra-bid priority
    # { '1C' : constraints, ('1H', '1S'): [constraints, constraints] }
    constraints = {}
    forcing = None
    preconditions = []
    preconditions_per_call = {}  # { '3N': precondition, ('2N', '3N'): [preconditions] }
    # The rule's own order among its calls (z3b.prefer); None or []: the cheaper call first.
    prefer = None
    # The call of last resort for its purpose (and strain, where the purpose prefers one):
    # loses to every rule of the purpose that is not one, and partner reads it as denying
    # their calls.  An integer for a deeper level of last resort (2 loses to 1).
    fallback = 0
    # Why the call is made (z3b.purposes): the ordering between calls of different purposes.
    purpose = None
    purposes_per_call = {}  # { '1C': purpose }
    conditional_purposes = []  # [(condition, purpose)]: the hand meeting the condition promotes the call
    conditional_purposes_per_call = {}  # { '1C': [(condition, purpose)] }
    requires_planning = False
    # constraints which apply to call possible call_names.
    shared_constraints = []
    explanations_per_call = {}
    explanation = None

    # These are the only properties which are allowed to be defined in subclasses.
    # The RuleCompiler with enforce this.
    # FIXME: Should we autogenerate this list from this Rule declaration?
    ALLOWED_KEYS = set([
        "annotations",
        "annotations_per_call",
        "call_names",
        "category",
        "constraints",
        "forcing",
        "preconditions",
        "preconditions_per_call",
        "prefer",
        "fallback",
        "purpose",
        "purposes_per_call",
        "conditional_purposes",
        "conditional_purposes_per_call",
        "requires_planning",
        "shared_constraints",
        "explanations_per_call",
        "explanation",
    ])

    def __init__(self):
        assert False, "Rule objects should be compiled into EngineRule objects instead of instantiating them."

    @classmethod
    def name(cls):
        return cls.__name__

    def __repr__(self):
        return "%s()" % self.name
