import dbg from "./dbg"

let last_generated_id_epoch = Date.now()
let last_generated_id_disambiguator = 0


/** ID composed of epoch and a disambiguator.
 * Uses a global counter that resets every epoch to set `disambiguator`
 * upon instantiation. The counter is incremented upon each instantiation.
 *
 * The string representation of an ID is "{epoch}_{disambiguator}" (without
 * the curly braces).
 *
 * If `empty` is `true`, it'll construct an ID with `epoch` and `disambiguator`
 * set to `-1`. This is used for alternative methods of constructing an ID,
 * e.g. by `new_from_string`. It also won't set `last_generated_id_epoch` or
 * `last_generated_id_disambiguator`, so the ID constructed won't count as
 * a generated ID as far as subsequent instantiations are concerned. The main
 * use case for this is getting an ID object for IDs that already exist, e.g.
 * in string form.
*/
class ID {
    epoch: number
    disambiguator: number

    constructor(empty: boolean = false) {
        if (empty) {
            this.epoch = -1
            this.disambiguator = -1
        } else {
            this.epoch = Date.now()
            if (this.epoch == last_generated_id_epoch ) {
                this.disambiguator = last_generated_id_disambiguator + 1
            }
            else {
                this.disambiguator = 0
            }

            last_generated_id_epoch = this.epoch
            last_generated_id_disambiguator = this.disambiguator
        }
    }

    as_string(): string {
        return this.epoch + "_" + this.disambiguator
    }

    // Maybe rework this to raise exceptions.
    static new_from_string(id_string: string): ID | null {
        let elements = id_string.split("_")
        if (elements.length < 2) {
            dbg.debug("Attempted to construct ID from malformed string.")
            return null
        }
        try {
            let new_id = new ID(true)
            new_id.epoch = Number(elements[0])
            new_id.disambiguator = Number(elements[1])
            return new_id
        } catch (e) {
            dbg.debug("Encountered error trying to construct ID from string: " + e)
            return null
        }
        return null
    }
}


export {
    ID
}
