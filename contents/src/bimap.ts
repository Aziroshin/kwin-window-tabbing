// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: Copyright and related rights waived via CC0 (https://creativecommons.org/publicdomain/zero/1.0/) in 2026 by Christian Knuchel


/** A bijective map. */
class Bimap<A, B> {
    protected b_by_a = new Map<A, B>()
    protected a_by_b = new Map<B, A>()
    
    get_b_by_a(a: A) {
        return this.b_by_a.get(a)
    }
    
    get_a_by_b(b: B) {
        return this.a_by_b.get(b)
    }
    
    get_entries_by_a() {
        return this.b_by_a.entries()
    }
    
    get_entries_by_b() {
        return this.a_by_b.entries()
    }
    
    /** Get all 'a' items. */
    get_all_a() {
        this.b_by_a.keys()
    }
    
    /** Get all 'b' items. */
    get_all_b() {
        this.a_by_b.keys()
    }
    
    set(a: A , b: B) {
        this.b_by_a.set(a, b)
        this.a_by_b.set(b, a)
    }
    
    has_in_a(a: A) {
        return this.b_by_a.has(a)
    }
    
    has_in_b(b: B) {
        return this.a_by_b.has(b)
    }
    
    delete_by_a(a: A) {
        let b = this.b_by_a.get(a)
        if (b === undefined) {
            return false
        }
        this.a_by_b.delete(b)
        this.b_by_a.delete(a)
    }
    
    delete_by_b(b: B) {
        let a = this.a_by_b.get(b)
        if (a === undefined) {
            return false
        }
        this.b_by_a.delete(a)
        this.a_by_b.delete(b)
    }
    
    get_size() {
        return this.a_by_b.size
    }
    
    forEach(callbackfn: (b: B, a: A, bimap: Bimap<A, B>) => void, thisArg?: any): void {
        return this.b_by_a.forEach((b, a, _map) => {
            thisArg? callbackfn.bind(this)(b, a, this) : callbackfn(b, a, this)
        })
    }
    
    clear() {
        this.a_by_b.clear()
        this.b_by_a.clear()
    }

}


export {
    Bimap
}
