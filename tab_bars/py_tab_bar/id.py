#-*- coding: utf-8 -*-

# Import: Python
import datetime
from typing import Any


def get_millisecond_epoch() -> int:
    return int(float(datetime.datetime.now().timestamp()*1000))
    #return int(datetime.datetime.now().microsecond / 1000)


def create_type_incompatible_error_message(
    operation: str,
    first_obj: Any,
    second_obj: Any
):
    return "'{operation}' not supported between instances of '{first_type}' and '{second_type}'".format(
        operation = operation,
        first_type = first_obj.__class__,
        second_type = second_obj.__class__
    )


class IDClass(type):
    last_generated_id_epoch: int = get_millisecond_epoch()
    last_generated_id_disambiguator: int = 0


class ID(object, metaclass = IDClass):
    epoch: int
    disambiguator: int

    def __init__(
        self,
        epoch: int | None = None,
        disambiguator: int | None = None
    ):
        if epoch is not None and disambiguator is not None:
            self.epoch = epoch
            self.disambiguator = disambiguator
        else:
            self.epoch = get_millisecond_epoch()
            if self.epoch == self.__class__.last_generated_id_epoch:
                self.disambiguator = self.__class__.last_generated_id_disambiguator + 1
            else:
                self.disambiguator = 0
                self.__class__.last_generated_id_epoch = self.epoch
            self.__class__.last_generated_id_disambiguator = self.disambiguator

    def as_string(self) -> str:
        return str(self.epoch) + "_" + str(self.disambiguator)

    def __eq__(self, other: Any) -> bool:
        if issubclass(other.__class__, self.__class__):
            return self.epoch == other.epoch and self.disambiguator == other.disambiguator
        elif isinstance(other, str):
            return self.as_string() == other
        else:
            return False

    def __gt__(self, other: Any) -> bool:
        if issubclass(other.__class__, self.__class__):
            other_epoch = other.epoch
            other_disambiguator = other.disambiguator
        elif isinstance(other, str):
            try:
                other_epoch, other_disambiguator = [int(s) for s in other.partition("_")[0::2]]
            except ValueError:
                # The string isn't even of the "int_int" variety.
                raise TypeError("ID string needs to consist of two int-convertible strings separated by an underscore ('_'). 'other' is this instead: '{other}'".format(
                    other = other
                ))
        else:
            raise TypeError(create_type_incompatible_error_message(">", self, other))

        if self.epoch > other_epoch:
            return True
        elif self.epoch == other_epoch:
            if self.disambiguator > other_disambiguator:
                return True
            else:
                return False
        else:
            return False

    def __lt__(self, other: Any) -> bool:
        try:
            return not other == self and not self.__gt__(other)
        except TypeError as err:
            # Probably doesn't work quite yet; needs to be tested.
            if str(err) == "TypeError: " + create_type_incompatible_error_message(">", self, other):
                raise TypeError(create_type_incompatible_error_message("<", self, other))
            else:
                raise
