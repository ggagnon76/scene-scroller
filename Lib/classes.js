// Override Token methods to replace ._id with .ss_id
export class ScrollerToken extends CONFIG.Token.objectClass {

    get id() {
        return this.document.ss_id;
    }
}