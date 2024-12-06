export const SearchForm = ({ handleSearch }) => {
    return (
        <div className="flex flex-col items-center md:text-base text-xs">
            <div className="flex min-[1126px]:justify-end justify-center w-full"> 
            <form className="p-2 bg-gray-700 rounded-md flex flex-row" onSubmit={(e) => handleSearch(e)}> 
                <div className="mx-2">
                    <label className="block text-white">Search Text:</label>
                    <input type="text" name="value" required></input>
                </div>
            </form>
            </div>
        </div>
    );
};