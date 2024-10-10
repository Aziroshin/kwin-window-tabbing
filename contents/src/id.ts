let last_generated_id_epoch = Date.now()
let last_generated_id_disambiguator = 0


class ID {
    epoch: number
    disambiguator: number

    constructor() {
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


export {
    ID
}
