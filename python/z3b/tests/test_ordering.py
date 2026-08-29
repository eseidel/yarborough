import unittest

from z3b.ordering import Ordering


class OrderingTest(unittest.TestCase):
    def test_transitively_orders_items(self):
        ordering = Ordering()
        ordering.order(1, 2, 3)

        self.assertTrue(ordering.lt(1, 2))
        self.assertTrue(ordering.lt(1, 3))
        self.assertTrue(ordering.lt(2, 3))
        self.assertFalse(ordering.lt(3, 1))

    def test_rejects_cycles(self):
        ordering = Ordering()
        ordering.order(1, 2)
        ordering.order(2, 1)

        with self.assertRaisesRegex(AssertionError, "Cycle detected"):
            ordering.lt(1, 2)
