# -*- coding: utf-8 -*-

# Imports: Python
import sys
from pathlib import Path
import unittest
import time

# Inserting parent directory for project imports for testing.
# Note: Any module in the parent directory with the same name as
# a test module in our directory (test) will shadow said test
# module - which should be fine, unless we want to import other
# test modules here for some reason.
sys.path.insert(0, str(Path("..").resolve()))

# Imports: Project
from id import ID


class TestIDOnSystemTime(unittest.TestCase):
    older_id: ID
    newer_id: ID
    older_id_string: str
    newer_id_string: str

    def setUp(self) -> None:
        self.older_id = ID()
        self.older_id_string = str(self.older_id.epoch) + "_" + str(self.older_id.disambiguator)
        time.sleep(0.002)
        self.newer_id = ID()
        self.newer_id_string = str(self.newer_id.epoch) + "_" + str(self.newer_id.disambiguator)
    
    def test_eq_same_ids_equals_true(self):
        self.assertEqual(self.older_id == self.older_id, True)

    def test_eq_different_ids_equals_false(self):
        self.assertEqual(self.older_id == self.newer_id, False)

    def test_not_eq_same_ids_equals_false(self):
        self.assertEqual(self.older_id != self.older_id, False)

    def test_not_eq_different_ids_equals_true(self):
        self.assertEqual(self.older_id != self.newer_id, True)

    def test_gt_newer_id_greater_than_older_id_equals_true(self):
        self.assertEqual(self.newer_id > self.older_id, True)

    def test_gt_older_id_greater_than_newer_id_equals_false(self):
        self.assertEqual(self.older_id > self.newer_id , False)

    def test_lt_older_id_lower_than_newer_id_equals_true(self):
        self.assertEqual(self.older_id < self.newer_id, True)

    def test_lt_newer_id_lower_than_older_id_equals_true(self):
        self.assertEqual(self.newer_id < self.older_id, False)

    def test_eq_string(self):
        self.assertEqual(self.older_id.as_string() == self.older_id_string, True)

    def test_gt_string(self):
        self.assertEqual(self.newer_id > self.older_id_string, True)
    
    def test_lt_string(self):
        self.assertEqual(self.older_id < self.newer_id_string, True)


class TestIDOnFakeTimeWithoutDisambiguator(TestIDOnSystemTime):
    def setUp(self) -> None:
        self.older_id = ID(     1728996943633, 0)
        self.older_id_string = "1728996943633_0"
        self.newer_id = ID(     1728996943634, 0)
        self.newer_id_string = "1728996943634_0"


class TestIDOnFakeTimeWithDisambiguator(TestIDOnSystemTime):
    def setUp(self) -> None:
        self.older_id = ID(     1728996943633, 0)
        self.older_id_string = "1728996943633_0"
        self.newer_id = ID(     1728996943633, 1)
        self.newer_id_string = "1728996943633_1"


class TestIDWrongInitArgs(unittest.TestCase):
    def test_str_and_int(self):
        self.assertRaises(
            TypeError,
            ID, 
            "String instead of epoch",
            132
        )
