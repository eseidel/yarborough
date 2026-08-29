import functools

class Ordering(object):
    @functools.total_ordering
    class OrderedItem(object):
        def __init__(self, ordering, item):
            self._ordering = ordering
            self._item = item

        def __eq__(self, other):
            return self._item == other._item

        def __lt__(self, other):
            return self._ordering.lt(self._item, other._item)

    def __init__(self):
        self._graph = {}
        self._compiled = True

    def lt(self, left, right):
        self._compile()

        return right in self._graph.get(left, ())

    def key(self, item):
        return Ordering.OrderedItem(self, item)

    def order(self, *args):
        self._compiled = False

        result = set()
        for blob in args:
            for item in self._iterate(blob):
                result.add(item)
                self._graph.setdefault(item, set())

        for i in range(len(args)-1):
            for lower in self._iterate(args[i]):
                for higher in self._iterate(args[i+1]):
                    self._graph.setdefault(lower, set()).add(higher)
                    self._graph.setdefault(higher, set())

        return result

    def _compile(self):
        if self._compiled:
            return

        self._check_cycles()
        for left in self._graph:
            self._graph[left].update(self._descendants(left))
        self._compiled = True

    def _descendants(self, item):
        descendants = set()
        pending = list(self._graph[item])
        while pending:
            current = pending.pop()
            if current in descendants:
                continue
            descendants.add(current)
            pending.extend(self._graph[current])
        return descendants

    def _check_cycles(self):
        visited = set()
        visiting = set()

        def visit(item):
            if item in visiting:
                raise AssertionError("Cycle detected")
            if item in visited:
                return
            visiting.add(item)
            for next_item in self._graph[item]:
                visit(next_item)
            visiting.remove(item)
            visited.add(item)

        for item in self._graph:
            visit(item)

    def _iterate(self, list_or_not):
        try:
            for item in list_or_not:
                yield item
        except TypeError:
            yield list_or_not
