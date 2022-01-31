"use strict";

const BaseObject = require("../../src/commons/baseObject"),
    chai = require("chai"),
    sinonChai = require("sinon-chai"),
    chaiAsPromised = require("chai-as-promised"),
    EXPECT = chai.expect;

chai.use(sinonChai);
chai.use(chaiAsPromised);

describe("BaseObject Test Suite", () => {
    describe("Success Cases", () => {
        it("baseObject has event", async () => {
            let baseObject = new BaseObject({ test: "test" });
            EXPECT(baseObject).to.haveOwnProperty("event");
        });


        it("createResponse return object with response", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.createResponse("SUCCESS", {});
            EXPECT(result.statusCode).to.equal(200);
        });

        it("createResponse return object with response", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.createResponse("SUCCESS");
            EXPECT(result.statusCode).to.equal(200);
        });

        it("createResponse return object with response", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.createResponse("INTERNAL_ERROR", {}, { statusCode: 500, status: { code: "test" } });
            result = JSON.parse(result);
            EXPECT(result.statusCode).to.equal(500);
        });

        it("getDate return a string date", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.getDate();
            EXPECT(result).to.be.an("string");
        });

        it("createUUIDv4 return a object date", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.createUUIDv4();
            EXPECT(result).to.be.an("string");
        });

        it("extractTraceID return the traceID UUID", async () => {
            let baseObject = new BaseObject({ test: "test" });
            let result = baseObject.extractTraceID();
            EXPECT(result).to.be.an("string");
        });

        it("extractTraceID return the traceID UUID", async () => {
            let baseObject = new BaseObject({ headers: {} });
            let result = baseObject.extractTraceID();
            EXPECT(result).to.be.an("string");
        });

        it("extractTraceID return the traceID UUID", async () => {
            let baseObject = new BaseObject({ headers: { "X-Amzn-Trace-Id": "1-385748574547854" } });
            let result = baseObject.extractTraceID();
            EXPECT(result).to.be.an("string");
        });

        it("extractTraceID return the traceID UUID", async () => {
            let baseObject = new BaseObject({ headers: { "X-Amzn-Trace-Id": "Root=1-385748574547854" } });
            let result = baseObject.extractTraceID();
            EXPECT(result).to.be.an("string");
        });
    });
});
