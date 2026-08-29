"""Instance-aware memoization with explicit cache-value transfer."""

import functools


class memoized(object):
    """Memoize a method and allow callers to transfer ownership of a value."""

    def __init__(self, function):
        self._function = function
        self._results_cache = {}

    def __call__(self, *args):
        try:
            return self._results_cache[args]
        except KeyError:
            result = self._function(*args)
            self._results_cache[args] = result
            return result

    def take(self, *args):
        result = self(*args)
        del self._results_cache[args]
        return result

    def __get__(self, instance, owner):
        partial = functools.partial(self.__call__, instance)
        partial.take = functools.partial(self.take, instance)
        return partial
