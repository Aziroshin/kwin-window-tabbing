# -*- coding: utf-8 -*-
from typing import Generic, Iterator, List, Optional, TypeVar


class Record:
    id: str

    def __init__(self, id: str) -> None:
        self.id = id


T_Record = TypeVar("T_Record", bound=Record)
class RecordCollection(Generic[T_Record]):
    _list: List[T_Record]

    def __init__(self) -> None:
        self._list = []

    def append(self, record: T_Record) -> None:
        self._list.append(record)

    def get_by_id(self, id: str) -> Optional[T_Record]:
        for record in self._list:
            if record.id == id:
                return record

    def remove_by_id(self, id: str) -> None:
        [self._list.remove(record) for record in self._list if record.id == id]

    def remove(self, record: T_Record) -> None:
        self.remove_by_id(record.id)

    def get_id(self, prospective_record: T_Record) -> Optional[str]:
        for record in self._list:
            if record == prospective_record:
                return record.id

    def __iter__(self) -> Iterator[T_Record]:
      return self._list.__iter__()

    def __getitem__(self, id_or_index: str | int) -> T_Record:
        # When writing this as an if-else, the type isn't narroved for the
        # `str` case (at least for pyright). The two if statements
        # aren't fully encompassing all cases, of course, so we're explicitly
        # defining `record` here.
        record = None
        if isinstance(id_or_index, int):
            record = self._list[id_or_index]
        if isinstance(id_or_index, str):
            record = self.get_by_id(id_or_index)
        
        if record is None:
            raise KeyError("Group with the ID \"{id}\" not found.".format(id=id_or_index))
        
        return record

    def __contains__(self, record: str | T_Record) -> bool:
        if isinstance(record, str) and self.get_by_id(record):
            return True
        elif record in self._list:
            return True
        return False

    def __len__(self) -> int:
        return len(self._list)
