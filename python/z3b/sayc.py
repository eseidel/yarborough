
from z3b.rule_compiler import priority_ordering
from z3b.rules import *
from z3b.cappelletti import *


def _get_subclasses(base_class):
    subclasses = base_class.__subclasses__()
    for subclass in list(subclasses):
        subclasses.extend(_get_subclasses(subclass))
    return subclasses

def _concrete_rule_classes():
    return [cls for cls in _get_subclasses(Rule) if not cls.__subclasses__()]


class StandardAmericanYellowCard(object):
    # Rule ordering never decides a call (a category tie between two rules drops the call),
    # but it shows in warnings and in every walk over the rules: sorted by name so the order
    # is the same whatever __subclasses__ returns.  Not a set(): CompiledRule is not hashable.
    rules = sorted((RuleCompiler.compile(description_class) for description_class in _concrete_rule_classes()),
                   key=lambda rule: rule.name)
    assert len(rules) == len(set(rule.name for rule in rules)), "Duplicate rules!"
    priority_ordering = priority_ordering
